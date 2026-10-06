import { describe, expect, it, vi } from 'vitest';
import { DLG, STR, has, t } from '../data/zh';

describe('zh barrel (ARCHITECTURE §2.8.13)', () => {
  it('resolves keys from every section', () => {
    expect(t('ui.start')).toBe(STR['ui.start']);
    expect(has('npc.xiaolin')).toBe(true);
    expect(has('loc.bus_stop')).toBe(true);
    expect(DLG['xiaolin.first']?.length).toBeGreaterThan(0);
  });
  it('substitutes {vars} and leaves unknown vars untouched', () => {
    expect(t('ui.toast.item', { name: 'X' })).toBe(STR['ui.toast.item'].replace('{name}', 'X'));
    expect(t('vf.recog', { label: 'A' })).toContain('{conf}');
    expect(t('vf.counter', { n: 3 })).toBe('3/40');
  });
  it('marks a missing key with ⟦key⟧ and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(t('nope.missing')).toBe('⟦nope.missing⟧');
    expect(t('nope.missing')).toBe('⟦nope.missing⟧');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(has('nope.missing')).toBe(false);
    warn.mockRestore();
  });
});
