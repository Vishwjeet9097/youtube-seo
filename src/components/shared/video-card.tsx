import Image from "next/image";
import { Calendar, ExternalLink, Eye, MessageSquare, ThumbsUp } from "lucide-react";
import { Badge } from "@/components/shared/ui";
import { formatDate, formatDuration, formatNumber } from "@/lib/format";
import { tagCharacterUsage } from "@/lib/text";
import type { VideoRecord } from "@/types/research";

export function VideoCard({ video, children }: { video: VideoRecord; children?: React.ReactNode }) {
  const tags = video.tags ?? [];
  const usage = tagCharacterUsage(tags);
  const tagStatusLabel = video.tagStatus === "found"
    ? `${tags.length} public tag${tags.length === 1 ? "" : "s"}`
    : video.tagStatus === "empty"
      ? "No public tags"
      : "Tags unavailable";
  return (
    <article className="panel overflow-hidden">
      <div className="grid sm:grid-cols-[230px_1fr]">
        <div className="relative aspect-video min-h-36 overflow-hidden bg-surface-muted sm:aspect-auto">
          {video.thumbnailUrl ? (
            <Image src={video.thumbnailUrl} alt="" fill sizes="(max-width: 640px) 100vw, 230px" className="object-cover transition duration-300 hover:scale-[1.02]" />
          ) : <div className="grid h-full min-h-36 place-items-center text-xs text-muted">Thumbnail unavailable</div>}
          <span className="absolute bottom-2.5 right-2.5 rounded-lg bg-[#071715]/82 px-2 py-1 text-[10px] font-bold text-white shadow-sm backdrop-blur">{formatDuration(video.durationSeconds)}</span>
        </div>
        <div className="min-w-0 p-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <a href={video.url} target="_blank" rel="noopener noreferrer" className="group inline-flex items-start gap-1.5 text-sm font-bold leading-5 tracking-[-0.01em] hover:text-brand-strong">
                <span>{video.title}</span><ExternalLink className="mt-0.5 size-3.5 shrink-0 opacity-50 transition group-hover:opacity-100" />
              </a>
              <p className="mt-1.5 text-xs text-muted">{video.channelTitle}</p>
            </div>
            <Badge tone={video.tagStatus === "found" ? "success" : "warning"}>{tagStatusLabel}</Badge>
          </div>
          <dl className="mt-4 flex flex-wrap gap-x-4 gap-y-2.5 text-[11px] text-muted">
            <div className="flex items-center gap-1.5"><Eye className="size-3.5 text-subtle" /><span><span className="sr-only">Views: </span>{formatNumber(video.statistics.viewCount)}</span></div>
            <div className="flex items-center gap-1.5"><ThumbsUp className="size-3.5 text-subtle" /><span><span className="sr-only">Likes: </span>{formatNumber(video.statistics.likeCount)}</span></div>
            <div className="flex items-center gap-1.5"><MessageSquare className="size-3.5 text-subtle" /><span><span className="sr-only">Comments: </span>{formatNumber(video.statistics.commentCount)}</span></div>
            <div className="flex items-center gap-1.5"><Calendar className="size-3.5 text-subtle" /><span className="sr-only">Published date: </span><time dateTime={video.publishedAt}>{formatDate(video.publishedAt)}</time></div>
          </dl>
          <p className="mt-4 border-t pt-3 text-[11px] text-muted">{video.tagStatus === "unavailable" ? "Tag length unavailable." : <>Tag length: <strong className="font-bold text-foreground">{usage} of 500 characters</strong>, including commas.</>}</p>
        </div>
      </div>
      {children ? <div className="border-t bg-surface-raised/35 p-5">{children}</div> : null}
    </article>
  );
}
