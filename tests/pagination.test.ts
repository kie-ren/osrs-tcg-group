import { describe, expect, it } from 'vitest';
import { paginate } from '../src/pagination';

describe('pagination', () => {
  const cards = Array.from({ length: 450 }, (_, index) => `Card ${index + 1}`);

  it('shows 200 cards per page by default', () => {
    expect(paginate(cards, 0)).toMatchObject({
      currentPage: 0, totalPages: 3, start: 1, end: 200,
    });
    expect(paginate(cards, 0).items).toHaveLength(200);
  });

  it('returns the final partial page', () => {
    const page = paginate(cards, 2);
    expect(page.items).toHaveLength(50);
    expect(page.start).toBe(401);
    expect(page.end).toBe(450);
  });

  it('clamps pages that are outside the available range', () => {
    expect(paginate(cards, 99).currentPage).toBe(2);
    expect(paginate(cards, -4).currentPage).toBe(0);
  });
});

