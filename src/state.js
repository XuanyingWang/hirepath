// ── STATE ─────────────────────────────────────────────────────────────────────

function _defaultBqStore() {
  const make = (id, category, question) => ({ id, question, category, isBuiltIn: true, linkedStoryId: null, tunedAnswer: null })
  return [
    make('bq_builtin_01', 'Ambiguity',        'Tell me about a time you had to make a major decision with incomplete information.'),
    make('bq_builtin_02', 'Ambiguity',        'Describe a situation where requirements were unclear. How did you define scope and move forward?'),
    make('bq_builtin_03', 'Leadership',       'Describe a project where you had significant technical influence beyond your immediate team.'),
    make('bq_builtin_04', 'Leadership',       'Tell me about a time you influenced a technical decision without direct authority.'),
    make('bq_builtin_05', 'Technical Depth',  'Tell me about the most technically complex problem you\'ve solved at scale.'),
    make('bq_builtin_06', 'Technical Depth',  'Describe a significant architectural decision you made. What were the tradeoffs and how did you evaluate them?'),
    make('bq_builtin_07', 'Conflict',         'Tell me about a time you disagreed with your manager or tech lead. How did you handle it?'),
    make('bq_builtin_08', 'Conflict',         'Describe a situation where you had to navigate conflicting priorities across multiple teams.'),
    make('bq_builtin_09', 'Failure',          'Tell me about a significant project failure. What happened and what did you learn?'),
    make('bq_builtin_10', 'Failure',          'Describe a time you made a wrong technical call. How did you recover?'),
    make('bq_builtin_11', 'Execution',        'Tell me about a time you had to deliver a critical project under tight time or resource constraints.'),
    make('bq_builtin_12', 'Execution',        'How have you managed competing priorities when multiple high-priority requests arrived simultaneously?'),
    make('bq_builtin_13', 'Cross-functional', 'Tell me about a time you drove alignment across multiple teams with conflicting interests.'),
    make('bq_builtin_14', 'Cross-functional', 'Describe the most impactful cross-functional project you\'ve led or contributed to significantly.'),
    make('bq_builtin_15', 'Mentorship',       'Tell me about a time you mentored an engineer and helped them grow substantially.'),
    make('bq_builtin_16', 'Mentorship',       'Describe how you\'ve contributed to improving team processes, culture, or engineering practices.'),
  ]
}

function _initS() {
  const s = JSON.parse(localStorage.getItem('l5v3') || 'null') || {
    folders: [{ id: 'f1', name: 'Distributed Systems', icon: '⚡', open: true }],
    chapters: []
  }
  if (!s.behavioral) s.behavioral = { resumes: [], stories: [], bqStore: _defaultBqStore() }
  else {
    if (!s.behavioral.resumes) {
      // Migrate old format (flat resumeText + bullets) → resumes array
      const oldBullets = (s.behavioral.bullets || []).map(b => ({
        id: b.id || _uid(), text: b.text, role: b.role || 'Experience',
        hmQuestions: (b.hmQuestions || []).map(q => typeof q === 'string' ? { id: _uid(), text: q, answer: '' } : { ...q, answer: q.answer || '' }),
        questionsGenerated: (b.hmQuestions || []).length > 0
      }))
      s.behavioral.resumes = oldBullets.length > 0
        ? [{ id: _uid(), name: 'Imported Resume', text: s.behavioral.resumeText || '', bullets: oldBullets, createdAt: new Date().toISOString() }]
        : []
      delete s.behavioral.bullets; delete s.behavioral.resumeText
    }
    if (!s.behavioral.bqStore) s.behavioral.bqStore = _defaultBqStore()
  }
  if (!s.jobPrep) s.jobPrep = { companies: [] }
  return s
}

function _uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

export const state = {
  S: _initS(),
  activeCid: null,
  activeTab: 'knowledge',
  quizState: null,
  setupModes: {},
  dragState: null,
  behavioralTab: 'resume',   // kept for backward compat, not used for routing
  bqTab: 'bqstore',          // 'bqstore' | 'storystore'
  bqDetailId: null,          // string id of BQ being viewed in detail, null = list
  bhResumeId: null,
  bhBulletId: null,
  bhAddingResume: false,
  editingStoryId: null,
  jobPrepView: null,         // null = home | { type: 'company', name } | { type: 'posting', id }
  apiKey: '',
  lang: localStorage.getItem('l5lang') || 'zh',
  // Flashcard session state (ephemeral — not persisted)
  fcSession: [],       // card objects for current pass
  fcIdx: 0,           // index into fcSession
  fcFlipped: false,   // is current card face-up (showing back)?
  fcSessionCid: null, // which chapter this session belongs to
}

export function save() { localStorage.setItem('l5v3', JSON.stringify(state.S)) }
export function gch() { return state.S.chapters.find(c => c.id === state.activeCid) }
export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

export const BH_COMPETENCIES = ['Leadership', 'Ambiguity', 'Conflict Resolution', 'Bias for Action', 'Ownership', 'Collaboration', 'Technical Depth', 'Customer Focus']
