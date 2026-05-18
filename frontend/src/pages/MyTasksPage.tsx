import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Task } from '../types';

export default function MyTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  async function loadTasks() {
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch<Task[]>('/tasks/my');
      setTasks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load tasks');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTasks(); }, []);

  async function updateStatus(taskId: string, status: Task['status']) {
    setUpdating(taskId);
    try {
      await apiFetch(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update task');
    } finally {
      setUpdating(null);
    }
  }

  const byStatus = {
    not_started: tasks.filter((t) => t.status === 'not_started'),
    in_progress: tasks.filter((t) => t.status === 'in_progress'),
    completed: tasks.filter((t) => t.status === 'completed'),
  };

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">My To-Dos</h1>
          <p className="page-subtitle">
            Approved tasks assigned to your email appear here. Update their progress below.
          </p>
        </div>
        <button id="refresh-tasks-btn" className="btn btn-secondary" onClick={loadTasks}>
          🔄 Refresh
        </button>
      </div>

      {error && <div className="alert alert-error">⚠️ {error}</div>}

      {loading && (
        <div className="empty-state">
          <div className="empty-icon">⏳</div>
          <div className="empty-text">Loading your tasks...</div>
        </div>
      )}

      {!loading && tasks.length === 0 && (
        <div className="empty-state card">
          <div className="empty-icon">✅</div>
          <div className="empty-text">No approved tasks assigned to you yet.</div>
          <div style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '6px' }}>
            Tasks will appear here once a meeting owner approves them.
          </div>
        </div>
      )}

      {!loading && tasks.length > 0 && (
        <>
          {/* Stats row */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {[
              { label: 'Not Started', count: byStatus.not_started.length, color: 'var(--text-3)' },
              { label: 'In Progress', count: byStatus.in_progress.length, color: 'var(--warning)' },
              { label: 'Completed', count: byStatus.completed.length, color: 'var(--success)' },
            ].map((s) => (
              <div key={s.label} className="card" style={{ flex: '1', minWidth: '120px', textAlign: 'center', padding: '16px' }}>
                <div style={{ fontSize: '28px', fontWeight: 800, color: s.color }}>{s.count}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Task grid */}
          <div className="grid-tasks">
            {tasks.map((task) => (
              <div className="task-card fade-in" key={task.id} id={`my-task-${task.id}`}>
                <div className="flex-row" style={{ justifyContent: 'space-between' }}>
                  <span className={`badge badge-${task.status}`}>{task.status.replace('_', ' ')}</span>
                  <span className={`badge badge-${task.priority}`}>{task.priority}</span>
                </div>

                <div className="task-card-title">{task.title}</div>
                {task.description && <div className="task-card-desc">{task.description}</div>}

                <div style={{ display: 'grid', gap: '4px' }}>
                  {task.meetings?.title && (
                    <div className="task-card-meta">📋 {task.meetings.title}</div>
                  )}
                  {task.deadline_text && (
                    <div className="task-card-meta">📅 Due: {task.deadline_text}</div>
                  )}
                </div>

                {/* Status selector */}
                <div>
                  <label>Update Status</label>
                  <select
                    id={`task-status-${task.id}`}
                    value={task.status}
                    disabled={updating === task.id}
                    onChange={(e) => updateStatus(task.id, e.target.value as Task['status'])}
                    style={{ fontSize: '13px' }}
                  >
                    <option value="not_started">⬜ Not Started</option>
                    <option value="in_progress">🔄 In Progress</option>
                    <option value="completed">✅ Completed</option>
                  </select>
                </div>
                {updating === task.id && (
                  <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>⏳ Updating...</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
