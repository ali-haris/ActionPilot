export type Participant = {
  id?: string;
  name: string;
  email?: string | null;
  speaker_label?: string | null;
};

export type Meeting = {
  id: string;
  title: string;
  owner_id: string;
  status: 'created' | 'uploaded' | 'processing' | 'completed' | 'failed';
  transcript_text?: string | null;
  clean_transcript?: string | null;
  audio_file_path?: string | null;
  summary?: string | null;
  main_topics?: string[];
  processing_error?: string | null;
  created_at: string;
  participants?: Participant[];
  decisions?: Decision[];
  risks?: Risk[];
  tasks?: Task[];
  email_drafts?: EmailDraft[];
  is_owner?: boolean;
};

export type Decision = {
  id: string;
  decision: string;
  confidence: string;
  mentioned_by?: string | null;
};

export type Risk = {
  id: string;
  risk: string;
  severity: 'low' | 'medium' | 'high';
  suggested_action?: string | null;
  status: string;
};

export type Task = {
  id: string;
  meeting_id?: string;
  title: string;
  description?: string | null;
  assigned_to_name?: string | null;
  assigned_to_email?: string | null;
  deadline_text?: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'not_started' | 'in_progress' | 'completed';
  approval_status: 'pending' | 'approved' | 'rejected';
  source_quote?: string | null;
  meetings?: { title?: string };
};

export type EmailDraft = {
  id: string;
  subject: string;
  body: string;
  status: string;
};
