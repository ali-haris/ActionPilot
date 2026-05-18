import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { Meeting, Task } from '../types';

const SAMPLE_TRANSCRIPT = `Sarah: We need to submit the client proposal by Friday.
Ahmed: I can complete the design section by Thursday evening.
John: Pricing is still not finalized, but I will review it tomorrow.
Sarah: Great. Also, someone needs to send the client follow-up email today.
Ahmed: Sarah should send it after pricing is reviewed.`;

type Tab = 'overview' | 'tasks' | 'transcript' | 'email';

export default function MeetingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [uploadMode, setUploadMode] = useState<'audio' | 'text'>('audio');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadMeeting = useCallback(async () => {
    if (!id) return;
    setError('');
    try {
      const data = await apiFetch<Meeting>(`/meetings/${id}`);
      setMeeting(data);
      if (!transcript && data.transcript_text) setTranscript(data.transcript_text);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load meeting');
    }
  }, [id]);

  // Start polling when processing, stop when done/failed
  useEffect(() => {
    if (!meeting) return;
    if (meeting.status === 'processing') {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(async () => {
          const updated = await loadMeeting();
          if (updated && updated.status !== 'processing') {
            clearInterval(pollingRef.current!);
            pollingRef.current = null;
          }
        }, 4000);
      }
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
    return () => { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; } };
  }, [meeting?.status]);

  useEffect(() => { loadMeeting(); }, [loadMeeting]);

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] || null);
  }

  async function uploadAudio() {
    if (!id || !file) return;
    setLoading('upload');
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      await apiFetch(`/meetings/${id}/upload-audio`, { method: 'POST', body: form, isFormData: true });
      setFile(null);
      await loadMeeting();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading('');
    }
  }

  async function saveTranscript() {
    if (!id || !transcript.trim()) return;
    setLoading('transcript');
    setError('');
    try {
      await apiFetch(`/meetings/${id}/transcript`, {
        method: 'POST',
        body: JSON.stringify({ transcript: transcript.trim() }),
      });
      await loadMeeting();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcript save failed');
    } finally {
      setLoading('');
    }
  }

  async function processMeeting() {
    if (!id) return;
    setLoading('process');
    setError('');
    try {
      await apiFetch<Meeting>(`/meetings/${id}/process`, { method: 'POST' });
      await loadMeeting();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed');
      await loadMeeting();
    } finally {
      setLoading('');
    }
  }

  async function patchTask(taskId: string, patch: Partial<Task>) {
    setError('');
    try {
      await apiFetch(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(patch) });
      await loadMeeting();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Task update failed');
    }
  }

  async function deleteMeeting() {
    if (!id || !window.confirm("Are you sure you want to delete this meeting? All tasks and data will be lost forever.")) return;
    try {
      await apiFetch(`/meetings/${id}`, { method: 'DELETE' });
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete meeting');
    }
  }

  if (!meeting) {
    return (
      <div className="page fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <div className="empty-state">
          <div className="empty-icon">⏳</div>
          <div className="empty-text">Loading meeting...</div>
        </div>
      </div>
    );
  }

  const emailDraft = meeting.email_drafts?.[0];
  const isOwner = meeting.is_owner !== false;
  const isProcessing = meeting.status === 'processing' || loading === 'process';
  const canProcess = (meeting.status === 'uploaded' || meeting.transcript_text) && !isProcessing;
  const isCompleted = meeting.status === 'completed';

  // Step flow states
  const steps = [
    { key: 'created', label: 'Created' },
    { key: 'uploaded', label: 'Uploaded' },
    { key: 'processing', label: 'Processing' },
    { key: 'completed', label: 'Done' },
  ];
  const statusOrder = ['created', 'uploaded', 'processing', 'completed'];
  const currentIdx = statusOrder.indexOf(meeting.status === 'failed' ? 'processing' : meeting.status);

  return (
    <div className="page fade-in">
      {/* ── Header */}
      <div className="page-header">
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <button className="btn btn-ghost" onClick={() => navigate('/dashboard')} style={{ marginTop: '4px' }}>
            ← Back
          </button>
          <div>
            <h1 className="page-title">{meeting.title}</h1>
            <div className="flex-row" style={{ marginTop: '8px', gap: '8px' }}>
              <span className={`badge badge-${meeting.status}`}>{meeting.status.replace('_', ' ')}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                {new Date(meeting.created_at).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {isOwner && (
            <button
              className="btn btn-danger"
              onClick={deleteMeeting}
              title="Delete Meeting"
            >
              🗑️
            </button>
          )}
          {isOwner && (
            <button
              id="process-meeting-btn"
              className="btn btn-primary"
              onClick={processMeeting}
              disabled={!canProcess}
              style={{ flexShrink: 0 }}
            >
              {isProcessing ? (
                <><div className="processing-spinner" style={{ width: 16, height: 16 }} /> Processing...</>
              ) : (
                <>🤖 Process with AI</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Progress Steps */}
      <div className="card" style={{ padding: '16px 22px' }}>
        <div className="step-flow">
          {steps.map((step, i) => {
            const isDone = i < currentIdx || (i === currentIdx && meeting.status === 'completed');
            const isActive = i === currentIdx && meeting.status !== 'completed' && meeting.status !== 'failed';
            const isFailed = meeting.status === 'failed' && i === currentIdx;
            return (
              <div key={step.key} className="step">
                <div className={`step-dot ${isDone ? 'done' : isActive ? 'active' : ''}`} style={isFailed ? { background: 'var(--danger)', borderColor: 'var(--danger)', color: 'white' } : {}}>
                  {isDone ? '✓' : isFailed ? '✗' : i + 1}
                </div>
                <span className="step-label">{step.label}</span>
                {i < steps.length - 1 && <div className={`step-line ${i < currentIdx ? 'done' : ''}`} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Alerts */}
      {error && <div className="alert alert-error">⚠️ {error}</div>}
      {meeting.processing_error && (
        <div className="alert alert-error">❌ Processing error: {meeting.processing_error}</div>
      )}
      {isProcessing && (
        <div className="processing-banner">
          <div className="processing-spinner" />
          <div>
            <div style={{ fontWeight: 700, marginBottom: '2px' }}>AI is processing your meeting...</div>
            <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>
              Speechmatics is transcribing, Gemini is analyzing. This may take 1–3 minutes. Page will auto-refresh.
            </div>
          </div>
        </div>
      )}

      {/* ── Upload Section (only if not completed) */}
      {isOwner && !isCompleted && (
        <div className="card">
          <div className="card-title">
            <span>🎙️</span> Input — Upload Audio or Paste Transcript
          </div>

          {/* Participants summary */}
          {(meeting.participants || []).length > 0 && (
            <div className="flex-row" style={{ marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-3)' }}>Speakers:</span>
              {(meeting.participants || []).map((p, i) => (
                <span key={p.id || i} className="chip">
                  {p.speaker_label ? `${p.speaker_label} → ` : ''}{p.name}{p.email ? ` (${p.email})` : ''}
                </span>
              ))}
            </div>
          )}

          {/* Mode tabs */}
          <div className="tabs" style={{ marginBottom: '18px', width: 'fit-content' }}>
            <button
              id="tab-upload-audio"
              className={`tab ${uploadMode === 'audio' ? 'active' : ''}`}
              onClick={() => setUploadMode('audio')}
            >🎵 Audio File</button>
            <button
              id="tab-manual-transcript"
              className={`tab ${uploadMode === 'text' ? 'active' : ''}`}
              onClick={() => setUploadMode('text')}
            >📝 Manual Transcript</button>
          </div>

          {uploadMode === 'audio' && (
            <div style={{ display: 'grid', gap: '12px' }}>
              <div className={`upload-zone ${file ? 'has-file' : ''}`}>
                <input type="file" id="audio-file-input" accept="audio/*" onChange={onFileChange} />
                <div className="upload-icon">🎵</div>
                <div className="upload-text">Drop audio file or click to browse</div>
                <div className="upload-hint">Supported: MP3, WAV, M4A, AAC, OGG, FLAC, WEBM (max 50MB)</div>
                {file && <div className="upload-filename">✅ {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</div>}
              </div>
              <div className="flex-row">
                <button
                  id="upload-audio-btn"
                  className="btn btn-primary"
                  onClick={uploadAudio}
                  disabled={!file || loading === 'upload'}
                >
                  {loading === 'upload' ? '⏳ Uploading...' : '⬆️ Upload Audio'}
                </button>
                {meeting.audio_file_path && (
                  <div className="alert alert-success" style={{ padding: '8px 12px', fontSize: '13px' }}>
                    ✅ Audio file uploaded
                  </div>
                )}
              </div>
            </div>
          )}

          {uploadMode === 'text' && (
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>
                💡 Format: <code>SpeakerName: their words...</code> — one speaker per line
              </div>
              <textarea
                id="manual-transcript-input"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={10}
                placeholder={SAMPLE_TRANSCRIPT}
              />
              <div className="flex-row">
                <button
                  id="use-sample-btn"
                  className="btn btn-secondary"
                  onClick={() => setTranscript(SAMPLE_TRANSCRIPT)}
                >📋 Use Sample</button>
                <button
                  id="save-transcript-btn"
                  className="btn btn-primary"
                  onClick={saveTranscript}
                  disabled={!transcript.trim() || loading === 'transcript'}
                >
                  {loading === 'transcript' ? '⏳ Saving...' : '💾 Save Transcript'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Results (shown when completed or has data) */}
      {isCompleted && (
        <>
          {/* Tabs for sections */}
          <div className="tabs" style={{ width: 'fit-content' }}>
            <button id="tab-overview" className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>📊 Overview</button>
            <button id="tab-tasks" className={`tab ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>
              ✅ Tasks {meeting.tasks?.length ? `(${meeting.tasks.length})` : ''}
            </button>
            <button id="tab-transcript" className={`tab ${tab === 'transcript' ? 'active' : ''}`} onClick={() => setTab('transcript')}>📄 Transcript</button>
            <button id="tab-email" className={`tab ${tab === 'email' ? 'active' : ''}`} onClick={() => setTab('email')}>✉️ Email Draft</button>
          </div>

          {/* Overview Tab */}
          {tab === 'overview' && (
            <div style={{ display: 'grid', gap: '20px' }} className="fade-in">
              {/* Summary */}
              <div className="card">
                <div className="card-title">📋 Meeting Summary</div>
                <p style={{ color: 'var(--text-2)', lineHeight: 1.7 }}>{meeting.summary || 'No summary generated.'}</p>
                {(meeting.main_topics || []).length > 0 && (
                  <div className="chips">
                    {(meeting.main_topics || []).map((t) => <span key={t} className="chip">{t}</span>)}
                  </div>
                )}
              </div>

              {/* Decisions + Risks */}
              <div className="grid-2">
                <div className="card">
                  <div className="card-title">⚖️ Decisions</div>
                  {(meeting.decisions || []).length === 0 && <div className="empty-state" style={{ padding: '16px 0' }}><span className="empty-text">No decisions recorded.</span></div>}
                  {(meeting.decisions || []).map((d) => (
                    <div key={d.id} className="list-item">
                      <div className="list-item-title">{d.decision}</div>
                      <div className="flex-row" style={{ gap: '8px', marginTop: '4px' }}>
                        <span className={`badge badge-${d.confidence}`}>{d.confidence} confidence</span>
                        {d.mentioned_by && <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>by {d.mentioned_by}</span>}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="card">
                  <div className="card-title">⚠️ Risks</div>
                  {(meeting.risks || []).length === 0 && <div className="empty-state" style={{ padding: '16px 0' }}><span className="empty-text">No risks identified.</span></div>}
                  {(meeting.risks || []).map((r) => (
                    <div key={r.id} className="list-item">
                      <div className="list-item-title">{r.risk}</div>
                      <span className={`badge badge-${r.severity}`} style={{ marginTop: '4px' }}>{r.severity} severity</span>
                      {r.suggested_action && <div className="list-item-meta" style={{ marginTop: '4px' }}>💡 {r.suggested_action}</div>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick task stats */}
              {(meeting.tasks || []).length > 0 && (
                <div className="card">
                  <div className="card-title">🎯 Task Summary</div>
                  <div className="flex-row" style={{ gap: '16px' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '28px', fontWeight: 800 }}>{meeting.tasks!.length}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>Total</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--warning)' }}>
                        {meeting.tasks!.filter((t) => t.approval_status === 'pending').length}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>Pending</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--success)' }}>
                        {meeting.tasks!.filter((t) => t.approval_status === 'approved').length}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>Approved</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--danger)' }}>
                        {meeting.tasks!.filter((t) => t.approval_status === 'rejected').length}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>Rejected</div>
                    </div>
                  </div>
                  <button className="btn btn-secondary" style={{ marginTop: '12px' }} onClick={() => setTab('tasks')}>
                    View Tasks →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tasks Tab */}
          {tab === 'tasks' && (
            <div className="fade-in">
              {(meeting.tasks || []).length === 0 && (
                <div className="empty-state card">
                  <div className="empty-icon">🎯</div>
                  <div className="empty-text">No tasks generated for this meeting.</div>
                </div>
              )}
              <div className="grid-tasks">
                {(meeting.tasks || []).map((task) => (
                  <div className="task-card" key={task.id} id={`task-${task.id}`}>
                    <div className="flex-row" style={{ justifyContent: 'space-between' }}>
                      <span className={`badge badge-${task.approval_status}`}>{task.approval_status}</span>
                      <span className={`badge badge-${task.priority}`}>{task.priority}</span>
                    </div>
                    <div className="task-card-title">{task.title}</div>
                    {task.description && <div className="task-card-desc">{task.description}</div>}
                    <div style={{ display: 'grid', gap: '4px' }}>
                      <div className="task-card-meta">
                        👤 {task.assigned_to_name || 'Unassigned'}
                        {task.assigned_to_email && <span style={{ color: 'var(--accent)', marginLeft: '4px' }}>({task.assigned_to_email})</span>}
                      </div>
                      {task.deadline_text && <div className="task-card-meta">📅 {task.deadline_text}</div>}
                    </div>
                    {task.source_quote && <blockquote>"{task.source_quote}"</blockquote>}

                    {/* Approval buttons — only for owner */}
                    {isOwner && task.approval_status === 'pending' && (
                      <div className="flex-row" style={{ gap: '8px' }}>
                        <button
                          id={`approve-task-${task.id}`}
                          className="btn btn-success"
                          style={{ flex: 1, justifyContent: 'center', fontSize: '13px' }}
                          onClick={() => patchTask(task.id, { approval_status: 'approved' })}
                        >✅ Approve</button>
                        <button
                          id={`reject-task-${task.id}`}
                          className="btn btn-danger"
                          style={{ flex: 1, justifyContent: 'center', fontSize: '13px' }}
                          onClick={() => patchTask(task.id, { approval_status: 'rejected' })}
                        >❌ Reject</button>
                      </div>
                    )}
                    {task.approval_status !== 'pending' && (
                      <div className="task-card-meta" style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                        Status: {task.status.replace('_', ' ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transcript Tab */}
          {tab === 'transcript' && (
            <div className="card fade-in">
              <div className="card-title">📄 Clean Transcript</div>
              <div className="transcript-box">
                {meeting.clean_transcript || meeting.transcript_text || 'No transcript available.'}
              </div>
            </div>
          )}

          {/* Email Draft Tab */}
          {tab === 'email' && (
            <div className="card fade-in">
              <div className="card-title">✉️ Follow-up Email Draft</div>
              {!emailDraft ? (
                <div className="empty-state" style={{ padding: '20px 0' }}>
                  <div className="empty-text">No email draft generated.</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  <div>
                    <label>Subject</label>
                    <input id="email-subject" readOnly value={emailDraft.subject} />
                  </div>
                  <div>
                    <label>Body</label>
                    <textarea id="email-body" readOnly value={emailDraft.body} rows={14} />
                  </div>
                  <button
                    id="copy-email-btn"
                    className="btn btn-secondary"
                    onClick={() => navigator.clipboard.writeText(`Subject: ${emailDraft.subject}\n\n${emailDraft.body}`)}
                  >
                    📋 Copy to Clipboard
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Show tasks section even if not completed (for manual re-process) */}
      {!isCompleted && (meeting.tasks || []).length > 0 && (
        <div className="card">
          <div className="card-title">🎯 Action Items (Previous Run)</div>
          <div className="grid-tasks">
            {(meeting.tasks || []).map((task) => (
              <div className="task-card" key={task.id}>
                <div className="flex-row" style={{ justifyContent: 'space-between' }}>
                  <span className={`badge badge-${task.approval_status}`}>{task.approval_status}</span>
                  <span className={`badge badge-${task.priority}`}>{task.priority}</span>
                </div>
                <div className="task-card-title">{task.title}</div>
                <div className="task-card-meta">👤 {task.assigned_to_name || 'Unassigned'}</div>
                {isOwner && task.approval_status === 'pending' && (
                  <div className="flex-row">
                    <button className="btn btn-success" style={{ flex: 1, justifyContent: 'center', fontSize: '13px' }}
                      onClick={() => patchTask(task.id, { approval_status: 'approved' })}>✅ Approve</button>
                    <button className="btn btn-danger" style={{ flex: 1, justifyContent: 'center', fontSize: '13px' }}
                      onClick={() => patchTask(task.id, { approval_status: 'rejected' })}>❌ Reject</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
