use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use serde::{Deserialize, Serialize};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

// ── Anthropic API types ───────────────────────────────────────────────────────

/// System prompt block with optional prompt-caching marker.
#[derive(Serialize)]
struct SystemBlock {
    #[serde(rename = "type")]
    block_type: String,
    text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    cache_control: Option<CacheControl>,
}

#[derive(Serialize)]
struct CacheControl {
    #[serde(rename = "type")]
    cache_type: String,
}

#[derive(Serialize)]
struct ClaudeMessage {
    role: String,
    content: String,
}

/// Non-streaming request body.
#[derive(Serialize)]
struct ClaudeRequest {
    model: String,
    max_tokens: u32,
    system: Vec<SystemBlock>,
    messages: Vec<ClaudeMessage>,
}

/// Streaming request body.
#[derive(Serialize)]
struct ClaudeStreamRequest {
    model: String,
    max_tokens: u32,
    stream: bool,
    system: Vec<SystemBlock>,
    messages: Vec<ClaudeMessage>,
}

#[derive(Deserialize)]
struct ClaudeResponse {
    content: Vec<ClaudeContent>,
    #[serde(default)]
    error: Option<ClaudeError>,
}

#[derive(Deserialize)]
struct ClaudeContent {
    #[serde(rename = "type")]
    content_type: String,
    text: Option<String>,
}

#[derive(Deserialize)]
struct ClaudeError {
    message: String,
}

/// Events emitted on the streaming channel.
#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum StreamEvent {
    Chunk { text: String },
    Done,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Wrap a system prompt string as a cached block array.
fn make_system(text: String) -> Vec<SystemBlock> {
    vec![SystemBlock {
        block_type: "text".to_string(),
        text,
        cache_control: Some(CacheControl {
            cache_type: "ephemeral".to_string(),
        }),
    }]
}

fn anthropic_headers(key: &str) -> [(&'static str, &'static str); 3] {
    let _ = key; // used at call site via variable
    [
        ("anthropic-version", "2023-06-01"),
        ("anthropic-beta", "prompt-caching-2024-07-31"),
        ("content-type", "application/json"),
    ]
}

// ── Config path helper ────────────────────────────────────────────────────────

fn config_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .expect("failed to resolve config dir")
        .join("config.json")
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Call the Anthropic Claude API (non-streaming).
#[tauri::command]
async fn call_claude(
    api_key: String,
    model: Option<String>,
    system: String,
    user_msg: String,
    max_tokens: u32,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    let messages = vec![ClaudeMessage {
        role: "user".to_string(),
        content: user_msg,
    }];

    let request_body = ClaudeRequest {
        model: model.unwrap_or_else(|| "claude-sonnet-4-6".to_string()),
        max_tokens,
        system: make_system(system),
        messages,
    };

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("anthropic-beta", "prompt-caching-2024-07-31")
        .header("content-type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&body) {
            if let Some(msg) = val.pointer("/error/message").and_then(|v| v.as_str()) {
                return Err(format!("Anthropic API error {}: {}", status, msg));
            }
        }
        return Err(format!("Anthropic API error {}: {}", status, body));
    }

    let claude_resp: ClaudeResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let text = claude_resp
        .content
        .into_iter()
        .filter(|c| c.content_type == "text")
        .filter_map(|c| c.text)
        .collect::<Vec<_>>()
        .join("");

    Ok(text)
}

/// Stream a Claude response token-by-token via a Tauri Channel.
/// Emits `{type:"chunk", text:"..."}` events followed by `{type:"done"}`.
#[tauri::command]
async fn call_claude_stream(
    api_key: String,
    model: Option<String>,
    system: String,
    user_msg: String,
    max_tokens: u32,
    on_event: tauri::ipc::Channel<StreamEvent>,
) -> Result<(), String> {
    let client = reqwest::Client::new();

    let request_body = ClaudeStreamRequest {
        model: model.unwrap_or_else(|| "claude-sonnet-4-20250514".to_string()),
        max_tokens,
        stream: true,
        system: make_system(system),
        messages: vec![ClaudeMessage {
            role: "user".to_string(),
            content: user_msg,
        }],
    };

    let mut response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("anthropic-beta", "prompt-caching-2024-07-31")
        .header("content-type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Anthropic API error {}: {}", status, body));
    }

    let mut buf = String::new();

    loop {
        match response.chunk().await.map_err(|e| e.to_string())? {
            None => break,
            Some(bytes) => {
                buf.push_str(&String::from_utf8_lossy(&bytes));

                // Process every complete `\n`-terminated SSE line in the buffer.
                while let Some(nl) = buf.find('\n') {
                    let line = buf[..nl].trim_end_matches('\r').to_string();
                    buf = buf[nl + 1..].to_string();

                    if let Some(data) = line.strip_prefix("data: ") {
                        if data == "[DONE]" {
                            let _ = on_event.send(StreamEvent::Done);
                            return Ok(());
                        }
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(data) {
                            if let Some(text) =
                                val.pointer("/delta/text").and_then(|v| v.as_str())
                            {
                                if !text.is_empty() {
                                    on_event
                                        .send(StreamEvent::Chunk {
                                            text: text.to_string(),
                                        })
                                        .map_err(|e| e.to_string())?;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Stream ended without [DONE] (unusual but handled gracefully).
    let _ = on_event.send(StreamEvent::Done);
    Ok(())
}

/// Fetch a web page and return its readable plain-text content (≤ 12 000 chars).
#[tauri::command]
async fn fetch_url(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) \
             AppleWebKit/537.36 (KHTML, like Gecko) \
             Chrome/120.0.0.0 Safari/537.36",
        )
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败：{}", e))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("网络请求失败：{}", e))?;

    if !resp.status().is_success() {
        return Err(format!(
            "HTTP {} — 无法获取页面（页面可能需要登录或 URL 有误）",
            resp.status().as_u16()
        ));
    }

    let html = resp
        .text()
        .await
        .map_err(|e| format!("读取响应内容失败：{}", e))?;

    let text = html_to_text(&html);

    // Cap at 12 000 chars (~3 000 tokens) to leave room for prompts + response
    let capped: String = text.chars().take(12_000).collect();

    if capped.trim().len() < 80 {
        return Err(
            "页面可提取的文本内容过少，请检查 URL 是否正确，或直接粘贴文档内容".to_string(),
        );
    }

    Ok(capped)
}

// ── HTML → plain text helpers ─────────────────────────────────────────────────

/// Remove every <tag …>…</tag> block (case-insensitive ASCII match).
fn remove_tag_blocks(html: &str, tag: &str) -> String {
    let open_pat = format!("<{}", tag);
    let close_pat = format!("</{}>", tag);
    // to_ascii_lowercase preserves byte positions for non-ASCII chars
    let lower = html.to_ascii_lowercase();
    let mut result = String::with_capacity(html.len());
    let mut pos = 0usize;

    loop {
        match lower[pos..].find(open_pat.as_str()) {
            None => {
                result.push_str(&html[pos..]);
                break;
            }
            Some(rel) => {
                let start = pos + rel;
                result.push_str(&html[pos..start]);
                match lower[start..].find(close_pat.as_str()) {
                    None => break, // malformed HTML; discard rest
                    Some(rel2) => {
                        pos = start + rel2 + close_pat.len();
                    }
                }
            }
        }
    }
    result
}

fn html_to_text(html: &str) -> String {
    // 1. Strip noisy non-content blocks
    let h = remove_tag_blocks(html, "script");
    let h = remove_tag_blocks(&h, "style");
    let h = remove_tag_blocks(&h, "nav");
    let h = remove_tag_blocks(&h, "footer");
    let h = remove_tag_blocks(&h, "header");
    let h = remove_tag_blocks(&h, "aside");

    // 2. Strip remaining HTML tags; add newlines at block-level elements
    const BLOCK: &[&str] = &[
        "p", "div", "section", "article", "main", "pre", "blockquote",
        "h1", "h2", "h3", "h4", "h5", "h6",
        "li", "dt", "dd", "tr", "br",
    ];
    let mut out = String::with_capacity(h.len() / 2);
    let mut in_tag = false;
    let mut tag_buf = String::new();

    for c in h.chars() {
        match c {
            '<' => {
                in_tag = true;
                tag_buf.clear();
            }
            '>' if in_tag => {
                in_tag = false;
                let t = tag_buf.trim().to_ascii_lowercase();
                let name = t
                    .trim_start_matches('/')
                    .split(|c: char| !c.is_ascii_alphabetic())
                    .next()
                    .unwrap_or("");
                if BLOCK.contains(&name) && !out.ends_with('\n') {
                    out.push('\n');
                }
            }
            _ if in_tag => {
                tag_buf.push(c);
            }
            _ => {
                out.push(c);
            }
        }
    }

    // 3. Decode common HTML entities
    let out = out
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&nbsp;", " ")
        .replace("&#160;", " ")
        .replace("&mdash;", "\u{2014}")
        .replace("&ndash;", "\u{2013}")
        .replace("&ldquo;", "\u{201C}")
        .replace("&rdquo;", "\u{201D}")
        .replace("&lsquo;", "\u{2018}")
        .replace("&rsquo;", "\u{2019}");

    // 4. Collapse whitespace: max 2 consecutive newlines, single spaces
    let mut final_out = String::with_capacity(out.len());
    let mut nl_run = 0u8;
    let mut pending_space = false;

    for c in out.chars() {
        if c == '\r' {
            continue;
        }
        if c == '\n' {
            nl_run += 1;
            pending_space = false;
            if nl_run <= 2 {
                final_out.push('\n');
            }
        } else if c == ' ' || c == '\t' {
            if nl_run == 0 {
                pending_space = true;
            }
        } else {
            if pending_space && nl_run == 0 {
                final_out.push(' ');
            }
            pending_space = false;
            nl_run = 0;
            final_out.push(c);
        }
    }

    final_out.trim().to_string()
}

/// Read a local text file and return its UTF-8 content (capped at 100 000 chars).
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    let capped: String = content.chars().take(100_000).collect();
    Ok(capped)
}

/// Extract plain text from a PDF at the given file path.
#[tauri::command]
fn read_pdf_file(path: String) -> Result<String, String> {
    let text = pdf_extract::extract_text(std::path::Path::new(&path))
        .map_err(|e| format!("PDF extraction failed: {}", e))?;
    if text.trim().is_empty() {
        return Err("No readable text found in PDF. It may be a scanned image — please copy-paste the text instead.".to_string());
    }
    let capped: String = text.chars().take(100_000).collect();
    Ok(capped)
}

/// Extract plain text from raw PDF bytes (for browser file-input use).
#[tauri::command]
fn extract_pdf_bytes(bytes: Vec<u8>) -> Result<String, String> {
    let text = pdf_extract::extract_text_from_mem(&bytes)
        .map_err(|e| format!("PDF extraction failed: {}", e))?;
    if text.trim().is_empty() {
        return Err("No readable text found in PDF. It may be a scanned image — please copy-paste the text instead.".to_string());
    }
    let capped: String = text.chars().take(100_000).collect();
    Ok(capped)
}

/// List image files in a directory, sorted by filename (timestamp order).
/// Returns [{name, path}] for .png/.jpg/.jpeg/.webp files.
#[tauri::command]
fn list_image_files(path: String) -> Result<Vec<serde_json::Value>, String> {
    let dir = std::fs::read_dir(&path)
        .map_err(|e| format!("Cannot read directory: {}", e))?;

    let exts = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];
    let mut entries: Vec<(String, String)> = dir
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let p = e.path();
            let ext = p.extension()?.to_ascii_lowercase();
            let ext_str = ext.to_str()?;
            if !exts.contains(&ext_str) { return None; }
            let name = p.file_name()?.to_str()?.to_string();
            let full = p.to_str()?.to_string();
            Some((name, full))
        })
        .collect();

    entries.sort_by(|a, b| a.0.cmp(&b.0));

    let result = entries.into_iter()
        .map(|(name, full_path)| serde_json::json!({ "name": name, "path": full_path }))
        .collect();

    Ok(result)
}

/// Call Claude Vision API from the Rust backend (avoids WebView2 fetch restrictions).
/// images: array of {base64, media_type} objects.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VisionImage {
    base64: String,
    media_type: String,
}

#[tauri::command]
async fn call_claude_vision(
    api_key: String,
    model: Option<String>,
    system: String,
    text_prompt: String,
    images: Vec<VisionImage>,
    max_tokens: u32,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    let mut content: Vec<serde_json::Value> = images
        .iter()
        .map(|img| serde_json::json!({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": img.media_type,
                "data": img.base64
            }
        }))
        .collect();
    content.push(serde_json::json!({ "type": "text", "text": text_prompt }));

    let body = serde_json::json!({
        "model": model.unwrap_or_else(|| "claude-sonnet-4-20250514".to_string()),
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{ "role": "user", "content": content }]
    });

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Anthropic API error {}: {}", status, text));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let text = data["content"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter(|c| c["type"].as_str() == Some("text"))
        .filter_map(|c| c["text"].as_str())
        .collect::<Vec<_>>()
        .join("");

    Ok(text)
}

/// Read an image file and return it as a base64-encoded string.
#[tauri::command]
fn read_image_base64(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path)
        .map_err(|e| format!("Cannot read image: {}", e))?;
    Ok(BASE64.encode(&bytes))
}

// ── Gemini API ────────────────────────────────────────────────────────────────

#[tauri::command]
async fn call_gemini(
    api_key: String,
    system: String,
    user_msg: String,
    max_tokens: u32,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={}",
        api_key
    );
    let body = serde_json::json!({
        "system_instruction": { "parts": [{ "text": system }] },
        "contents": [{ "role": "user", "parts": [{ "text": user_msg }] }],
        "generationConfig": { "maxOutputTokens": max_tokens }
    });
    let response = client.post(&url)
        .header("content-type", "application/json")
        .json(&body)
        .send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
            if let Some(msg) = val.pointer("/error/message").and_then(|v| v.as_str()) {
                return Err(format!("Gemini API error {}: {}", status, msg));
            }
        }
        return Err(format!("Gemini API error {}: {}", status, text));
    }
    let data: serde_json::Value = response.json().await
        .map_err(|e| format!("Failed to parse Gemini response: {}", e))?;
    let text = data["candidates"]
        .as_array().unwrap_or(&vec![])
        .iter()
        .filter_map(|c| c.pointer("/content/parts"))
        .filter_map(|p| p.as_array())
        .flatten()
        .filter_map(|p| p["text"].as_str())
        .collect::<Vec<_>>()
        .join("");
    Ok(text)
}

#[tauri::command]
async fn call_gemini_stream(
    api_key: String,
    system: String,
    user_msg: String,
    max_tokens: u32,
    on_event: tauri::ipc::Channel<StreamEvent>,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key={}",
        api_key
    );
    let body = serde_json::json!({
        "system_instruction": { "parts": [{ "text": system }] },
        "contents": [{ "role": "user", "parts": [{ "text": user_msg }] }],
        "generationConfig": { "maxOutputTokens": max_tokens }
    });
    let mut response = client.post(&url)
        .header("content-type", "application/json")
        .json(&body)
        .send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body_text = response.text().await.unwrap_or_default();
        return Err(format!("Gemini API error {}: {}", status, body_text));
    }
    let mut buf = String::new();
    loop {
        match response.chunk().await.map_err(|e| e.to_string())? {
            None => break,
            Some(bytes) => {
                buf.push_str(&String::from_utf8_lossy(&bytes));
                while let Some(nl) = buf.find('\n') {
                    let line = buf[..nl].trim_end_matches('\r').to_string();
                    buf = buf[nl + 1..].to_string();
                    if let Some(data) = line.strip_prefix("data: ") {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(data) {
                            if let Some(parts) = val.pointer("/candidates/0/content/parts")
                                .and_then(|p| p.as_array()) {
                                for part in parts {
                                    if let Some(text) = part["text"].as_str() {
                                        if !text.is_empty() {
                                            on_event.send(StreamEvent::Chunk { text: text.to_string() })
                                                .map_err(|e| e.to_string())?;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    let _ = on_event.send(StreamEvent::Done);
    Ok(())
}

#[tauri::command]
async fn call_gemini_vision(
    api_key: String,
    system: String,
    text_prompt: String,
    images: Vec<VisionImage>,
    max_tokens: u32,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={}",
        api_key
    );
    let mut parts: Vec<serde_json::Value> = images.iter().map(|img| serde_json::json!({
        "inlineData": { "mimeType": img.media_type, "data": img.base64 }
    })).collect();
    parts.push(serde_json::json!({ "text": text_prompt }));
    let body = serde_json::json!({
        "system_instruction": { "parts": [{ "text": system }] },
        "contents": [{ "role": "user", "parts": parts }],
        "generationConfig": { "maxOutputTokens": max_tokens }
    });
    let response = client.post(&url)
        .header("content-type", "application/json")
        .json(&body)
        .send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Gemini API error {}: {}", status, text));
    }
    let data: serde_json::Value = response.json().await
        .map_err(|e| format!("Failed to parse Gemini response: {}", e))?;
    let text = data["candidates"]
        .as_array().unwrap_or(&vec![])
        .iter()
        .filter_map(|c| c.pointer("/content/parts"))
        .filter_map(|p| p.as_array())
        .flatten()
        .filter_map(|p| p["text"].as_str())
        .collect::<Vec<_>>()
        .join("");
    Ok(text)
}

// ── OpenAI API ────────────────────────────────────────────────────────────────

#[tauri::command]
async fn call_openai(
    api_key: String,
    system: String,
    user_msg: String,
    max_tokens: u32,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": "gpt-4o-mini",
        "max_tokens": max_tokens,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user_msg }
        ]
    });
    let response = client.post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("content-type", "application/json")
        .json(&body)
        .send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
            if let Some(msg) = val.pointer("/error/message").and_then(|v| v.as_str()) {
                return Err(format!("OpenAI API error {}: {}", status, msg));
            }
        }
        return Err(format!("OpenAI API error {}: {}", status, text));
    }
    let data: serde_json::Value = response.json().await
        .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;
    let text = data["choices"][0]["message"]["content"]
        .as_str().unwrap_or("").to_string();
    Ok(text)
}

#[tauri::command]
async fn call_openai_stream(
    api_key: String,
    system: String,
    user_msg: String,
    max_tokens: u32,
    on_event: tauri::ipc::Channel<StreamEvent>,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": "gpt-4o-mini",
        "max_tokens": max_tokens,
        "stream": true,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user_msg }
        ]
    });
    let mut response = client.post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("content-type", "application/json")
        .json(&body)
        .send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body_text = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI API error {}: {}", status, body_text));
    }
    let mut buf = String::new();
    loop {
        match response.chunk().await.map_err(|e| e.to_string())? {
            None => break,
            Some(bytes) => {
                buf.push_str(&String::from_utf8_lossy(&bytes));
                while let Some(nl) = buf.find('\n') {
                    let line = buf[..nl].trim_end_matches('\r').to_string();
                    buf = buf[nl + 1..].to_string();
                    if let Some(data) = line.strip_prefix("data: ") {
                        if data == "[DONE]" {
                            let _ = on_event.send(StreamEvent::Done);
                            return Ok(());
                        }
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(data) {
                            if let Some(text) = val.pointer("/choices/0/delta/content")
                                .and_then(|v| v.as_str()) {
                                if !text.is_empty() {
                                    on_event.send(StreamEvent::Chunk { text: text.to_string() })
                                        .map_err(|e| e.to_string())?;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    let _ = on_event.send(StreamEvent::Done);
    Ok(())
}

#[tauri::command]
async fn call_openai_vision(
    api_key: String,
    system: String,
    text_prompt: String,
    images: Vec<VisionImage>,
    max_tokens: u32,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let mut content: Vec<serde_json::Value> = images.iter().map(|img| serde_json::json!({
        "type": "image_url",
        "image_url": { "url": format!("data:{};base64,{}", img.media_type, img.base64) }
    })).collect();
    content.push(serde_json::json!({ "type": "text", "text": text_prompt }));
    let body = serde_json::json!({
        "model": "gpt-4o-mini",
        "max_tokens": max_tokens,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": content }
        ]
    });
    let response = client.post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("content-type", "application/json")
        .json(&body)
        .send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI API error {}: {}", status, text));
    }
    let data: serde_json::Value = response.json().await
        .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;
    let text = data["choices"][0]["message"]["content"]
        .as_str().unwrap_or("").to_string();
    Ok(text)
}

// ── Provider config (Gemini + OpenAI keys + active provider) ─────────────────

/// Save provider config alongside the existing Anthropic key.
#[tauri::command]
fn save_provider_config(
    app: AppHandle,
    gemini_key: String,
    openai_key: String,
    provider: String,
) -> Result<(), String> {
    let path = config_path(&app);
    let mut config: serde_json::Value = if path.exists() {
        let content = fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    config["gemini_key"] = serde_json::json!(gemini_key);
    config["openai_key"] = serde_json::json!(openai_key);
    config["provider"]   = serde_json::json!(provider);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, config.to_string()).map_err(|e| e.to_string())?;
    Ok(())
}

/// Load provider config — returns JSON string {geminiKey, openaiKey, provider}.
#[tauri::command]
fn load_provider_config(app: AppHandle) -> Result<String, String> {
    let path = config_path(&app);
    if !path.exists() {
        return Ok(r#"{"geminiKey":"","openaiKey":"","provider":"claude"}"#.to_string());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let config: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let result = serde_json::json!({
        "geminiKey": config["gemini_key"].as_str().unwrap_or(""),
        "openaiKey": config["openai_key"].as_str().unwrap_or(""),
        "provider":  config["provider"].as_str().unwrap_or("claude")
    });
    Ok(result.to_string())
}

/// Persist the Anthropic API key to disk (in the app's config directory).
#[tauri::command]
fn save_api_key(app: AppHandle, key: String) -> Result<(), String> {
    let path = config_path(&app);
    // Preserve any existing keys (gemini, openai, provider) while updating api_key.
    let mut config: serde_json::Value = if path.exists() {
        let content = fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    config["api_key"] = serde_json::json!(key);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, config.to_string()).map_err(|e| e.to_string())?;
    Ok(())
}

/// Show a native Save dialog and write `content` to the chosen path.
/// Returns true if the file was saved, false if the user cancelled.
#[tauri::command]
async fn save_backup_file(
    app: AppHandle,
    content: String,
    file_name: String,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    let result = tokio::task::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter("JSON Backup", &["json"])
            .set_file_name(&file_name)
            .blocking_save_file()
    })
    .await
    .map_err(|e| e.to_string())?;

    match result {
        None => Ok(false), // user cancelled
        Some(file_path) => {
            let path = match file_path {
                tauri_plugin_dialog::FilePath::Path(p) => p,
                _ => return Err("Unsupported path type".to_string()),
            };
            fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())?;
            Ok(true)
        }
    }
}

/// Show a native Open dialog, read the chosen JSON file, and return its contents.
/// Returns null (None → JS null) if the user cancelled.
#[tauri::command]
async fn pick_backup_file(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let result = tokio::task::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter("JSON Backup", &["json"])
            .blocking_pick_file()
    })
    .await
    .map_err(|e| e.to_string())?;

    match result {
        None => Ok(None), // user cancelled
        Some(file_path) => {
            let path = match file_path {
                tauri_plugin_dialog::FilePath::Path(p) => p,
                _ => return Err("Unsupported path type".to_string()),
            };
            let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            Ok(Some(content))
        }
    }
}

/// Load the stored API key, returning an empty string if none is saved yet.
#[tauri::command]
fn load_api_key(app: AppHandle) -> Result<String, String> {
    let path = config_path(&app);
    if !path.exists() {
        return Ok(String::new());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let config: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(config["api_key"].as_str().unwrap_or("").to_string())
}

// ── Entry point ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            call_claude,
            call_claude_stream,
            call_claude_vision,
            call_gemini,
            call_gemini_stream,
            call_gemini_vision,
            call_openai,
            call_openai_stream,
            call_openai_vision,
            fetch_url,
            save_api_key,
            load_api_key,
            save_provider_config,
            load_provider_config,
            read_text_file,
            read_pdf_file,
            extract_pdf_bytes,
            list_image_files,
            read_image_base64,
            save_backup_file,
            pick_backup_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
