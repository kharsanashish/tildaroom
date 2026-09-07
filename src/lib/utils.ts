import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Build a WhatsApp click-to-chat link that avoids the blocked api.whatsapp.com redirect on desktop. */
export function getWhatsAppLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  const encoded = encodeURIComponent(message);
  const isMobile =
    typeof navigator !== "undefined" &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobile) {
    return `https://wa.me/${normalized}?text=${encoded}`;
  }
  return `https://web.whatsapp.com/send?phone=${normalized}&text=${encoded}`;
}
