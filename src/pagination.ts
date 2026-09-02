export const DEFAULT_PAGE_SIZE = 200;

export type PageSlice<T> = {
  items: T[];
  currentPage: number;
  totalPages: number;
  start: number;
  end: number;
};

export function paginate<T>(items: T[], requestedPage: number, pageSize = DEFAULT_PAGE_SIZE): PageSlice<T> {
  const safeSize = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(items.length / safeSize));
  const currentPage = Math.max(0, Math.min(Math.floor(requestedPage), totalPages - 1));
  const startIndex = currentPage * safeSize;
  return {
    items: items.slice(startIndex, startIndex + safeSize),
    currentPage,
    totalPages,
    start: items.length === 0 ? 0 : startIndex + 1,
    end: Math.min(startIndex + safeSize, items.length),
  };
}

