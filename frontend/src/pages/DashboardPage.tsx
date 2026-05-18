import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { Meeting } from '../types';

interface ParticipantInput {
  name: string;
  email: string;
  speaker_label: string;
}

const DEFAULT_PARTICIPANT: ParticipantInput = { name: '', email: '', speaker_label: '' };

export default function DashboardPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [title, setTitle] = useState('');
  const [numSpeakers, setNumSpeakers] = useState(2);
  const [participants, setParticipants] = useState<ParticipantInput[]>([
    { name: '', email: '', speaker_label: 'S1' },
    { name: '', email: '', speaker_label: 'S2' },
  ]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const navigate = useNavigate();

  async function loadMeetings() {
    setError('');
    setListLoading(true);
    try {
      const data = await apiFetch<Meeting[]>('/meetings');
      setMeetings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load meetings');
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => { loadMeetings(); }, []);

  function updateSpeakerCount(n: number) {
    const count = Math.max(1, Math.min(10, n));
    setNumSpeakers(count);
    setParticipants(Array.from({ length: count }, (_, i) => {
      const existing = participants[i];
      return {
        name: existing?.name || '',
        email: existing?.email || '',
        speaker_label: existing?.speaker_label || `S${i + 1}`,
      };
    }));
  }

  function updateParticipant(idx: number, field: keyof ParticipantInput, value: string) {
    setParticipants((prev) => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  }

  async function createMeeting(event: FormEvent) {
    event.preventDefault();
    if (participants.some((p) => !p.name.trim())) {
      setError('Please fill in the name for all speakers.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const created = await apiFetch<Meeting>('/meetings', {
        method: 'POST',
        body: JSON.stringify({
          title,
          participants: participants.map((p) => ({
            name: p.name.trim(),
            email: p.email.trim() || null,
            speaker_label: p.speaker_label.trim() || null,
          })),
        }),
      });
      setTitle('');
      setParticipants([
        { name: '', email: '', speaker_label: 'S1' },
        { name: '', email: '', speaker_label: 'S2' },
      ]);
      setNumSpeakers(2);
      navigate(`/meetings/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create meeting');
    } finally {
      setLoading(false);
    }
  }

  function statusBadge(s: Meeting['status']) {
    return <span className={`badge badge-${s}`}>{s.replace('_', ' ')}</span>;
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Meetings</h1>
          <p className="page-subtitle">Create a meeting, upload audio or paste a transcript — ActionPilot will handle the rest.</p>
        </div>
        <button id="refresh-meetings" className="btn btn-secondary" onClick={loadMeetings}>
          🔄 Refresh
        </button>
      </div>

      {error && <div className="alert alert-error">⚠️ {error}</div>}

      {/* ── New Meeting Form */}
      <div className="card">
        <div className="card-title">
          <span>➕</span> New Meeting
        </div>
        <form className="grid-form" onSubmit={createMeeting} id="create-meeting-form">
          <div>
            <label>Meeting Title</label>
            <input
              id="meeting-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q3 Planning Session"
              required
            />
          </div>

          {/* Speaker count picker */}
          <div>
            <label>Number of Speakers</label>
            <div className="flex-row" style={{ gap: '12px' }}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  id={`speaker-count-${n}`}
                  className={numSpeakers === n ? 'btn btn-primary' : 'btn btn-secondary'}
                  style={{ padding: '8px 16px', minWidth: '44px' }}
                  onClick={() => updateSpeakerCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '6px' }}>
              🎤 Speechmatics will label speakers as S1, S2, S3... — map each to a real person below
            </div>
          </div>

          {/* Participant rows */}
          <div className="grid-form" style={{ gap: '10px' }}>
            <div className="section-label">Speaker Mapping</div>
            {participants.map((p, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
                <div>
                  <div className="participant-index">{i + 1}</div>
                </div>
                <div>
                  <label>Name *</label>
                  <input
                    id={`participant-name-${i}`}
                    value={p.name}
                    onChange={(e) => updateParticipant(i, 'name', e.target.value)}
                    placeholder={`Speaker ${i + 1} name`}
                    required
                  />
                </div>
                <div>
                  <label>Email (optional)</label>
                  <input
                    id={`participant-email-${i}`}
                    type="email"
                    value={p.email}
                    onChange={(e) => updateParticipant(i, 'email', e.target.value)}
                    placeholder="name@company.com"
                  />
                </div>
                <div>
                  <label>Label</label>
                  <input
                    id={`participant-label-${i}`}
                    value={p.speaker_label}
                    onChange={(e) => updateParticipant(i, 'speaker_label', e.target.value)}
                    placeholder={`S${i + 1}`}
                    style={{ width: '70px' }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div>
            <button id="create-meeting-btn" className="btn btn-primary" disabled={loading}>
              {loading ? '⏳ Creating...' : '🚀 Create Meeting'}
            </button>
          </div>
        </form>
      </div>

      {/* ── Meetings List */}
      <div>
        <div className="section-label" style={{ marginBottom: '12px' }}>
          All Meetings {!listLoading && `(${meetings.length})`}
        </div>

        {listLoading && (
          <div className="empty-state">
            <div className="empty-icon">⏳</div>
            <div className="empty-text">Loading meetings...</div>
          </div>
        )}

        {!listLoading && meetings.length === 0 && (
          <div className="empty-state card">
            <div className="empty-icon">🎙️</div>
            <div className="empty-text">No meetings yet. Create your first meeting above!</div>
          </div>
        )}

        <div className="grid-meetings">
          {meetings.map((meeting) => (
            <Link to={`/meetings/${meeting.id}`} className="meeting-card" key={meeting.id} id={`meeting-${meeting.id}`}>
              <div className="flex-row" style={{ justifyContent: 'space-between' }}>
                {statusBadge(meeting.status)}
                <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                  {new Date(meeting.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="meeting-card-title">{meeting.title}</div>
              <div className="meeting-card-summary">
                {meeting.summary || 'Upload audio or paste a transcript to generate insights.'}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
