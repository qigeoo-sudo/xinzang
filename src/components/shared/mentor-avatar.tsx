import Image from "next/image";
import { cn } from "@/lib/utils";

interface MentorAvatarProps {
  name: string;
  avatar?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  rounded?: "xl" | "2xl" | "full";
}

const sizeMap = {
  sm: "h-8 w-8 text-xs",
  md: "h-12 w-12 text-lg",
  lg: "h-14 w-14 text-lg",
  xl: "h-16 w-16 text-2xl",
};

const roundedMap = {
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  full: "rounded-full",
};

/**
 * 导师头像组件
 * - 有 avatar 图片时显示图片
 * - 没有时显示首字母 fallback
 */
export function MentorAvatar({
  name,
  avatar,
  size = "md",
  className,
  rounded = "2xl",
}: MentorAvatarProps) {
  const baseClass = cn(
    "flex shrink-0 items-center justify-center font-bold text-white shadow-sm bg-gradient-to-br from-brand-400 to-brand-600 overflow-hidden",
    sizeMap[size],
    roundedMap[rounded],
    className
  );

  if (avatar) {
    return (
      <div className={baseClass}>
        <Image
          src={avatar}
          alt={name}
          width={64}
          height={64}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return <div className={baseClass}>{name[0]}</div>;
}
