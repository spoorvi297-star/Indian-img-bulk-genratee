export const slugify = (text: string): string => {
  if (!text) return 'untitled';
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // remove non-word characters
    .replace(/[\s_-]+/g, '-') // collapse whitespace and replace with a dash
    .replace(/^-+|-+$/g, '') // remove leading or trailing dashes
    .substring(0, 50) || 'untitled'; // truncate to 50 chars and provide fallback
};
