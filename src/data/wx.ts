// src/data/wx.ts — owner F. GDD §11.12. WxDef has no trigger (ARCHITECTURE §2.4 #9): only {wx} actions push wx.
// Text lives in zh/wx.ts WX_TEXT (keys stay empty). Hint messages are StrKeys pushed by E's hint engine, not WxIds.
import type { WxDef, WxId } from '../types';

const tudi = (id: WxId, memo?: 1 | 2 | 3): WxDef => (memo ? { id, sender: 'tudi', keys: [], memo } : { id, sender: 'tudi', keys: [] });

export const WX: readonly WxDef[] = [
  tudi('wx_intro'), tudi('wx_rules'), tudi('wx_ch1'),
  { id: 'wx_auto_studio', sender: 'studio', keys: [] },
  tudi('wx_studio_bag'), tudi('wx_dusk'), tudi('wx_idol'), tudi('wx_after_scan'), tudi('wx_after_p4'), tudi('wx_mirror'),
  tudi('wx_night'),
  tudi('wx_name_memo', 2),          // 〔语音 · memo_2〕 bubble after the two lines
  tudi('wx_zhe'), tudi('wx_darkroom'), tudi('wx_dawn'), tudi('wx_bst3'), tudi('wx_bst6'), tudi('wx_endA'),
];
