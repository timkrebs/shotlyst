import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/files";
import { cn } from "@/lib/utils";

export function UserAvatar({
  name,
  color,
  url,
  className,
}: {
  name: string;
  color: string;
  url?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-8", className)} title={name}>
      {url ? <AvatarImage src={url} alt="" /> : null}
      <AvatarFallback className="text-xs font-medium text-white" style={{ backgroundColor: color }}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
