import { JobStatus } from "../../types/api.types";
import { Badge } from "../ui/Badge";
import { Clock, Play, CheckCircle, XCircle, X, Loader2, List } from "lucide-react";

export function JobStatusBadge({ status }: { status: JobStatus }) {
  switch (status) {
    case 'SCHEDULED':
      return <Badge variant="warning" className="gap-1"><Clock className="w-3 h-3" /> Scheduled</Badge>;
    case 'QUEUED':
      return <Badge variant="info" className="gap-1"><List className="w-3 h-3" /> Queued</Badge>;
    case 'CLAIMED':
      return <Badge variant="info" className="bg-purple-100 text-purple-800 gap-1"><Loader2 className="w-3 h-3" /> Claimed</Badge>;
    case 'RUNNING':
      return <Badge variant="running" className="gap-1"><Play className="w-3 h-3" /> Running</Badge>;
    case 'COMPLETED':
      return <Badge variant="success" className="gap-1"><CheckCircle className="w-3 h-3" /> Completed</Badge>;
    case 'FAILED':
      return <Badge variant="danger" className="gap-1"><XCircle className="w-3 h-3" /> Failed</Badge>;
    case 'CANCELLED':
      return <Badge variant="default" className="gap-1"><X className="w-3 h-3" /> Cancelled</Badge>;
  }
}
