/**
 * デフォルトアセット生成
 * -----------------------
 * テキストから新規に .sb3 を生成する場合、コストゥーム/音の実体が無い。
 * そのときに使う最小の SVG(白背景/オレンジの猫もどき)を生成する。
 */

export interface AssetFile {
  bytes: Uint8Array;
  ext: 'svg' | 'png' | 'wav' | 'mp3';
}

const enc = new TextEncoder();

/** ステージの背景: 白 480x360 */
export const STAGE_BACKDROP_SVG = `<svg version="1.1" width="480" height="360" viewBox="0 0 480 360" xmlns="http://www.w3.org/2000/svg">
  <rect width="480" height="360" fill="#ffffff"/>
</svg>`;

/** スプライトのデフォルトコスチューム: 簡単な猫風キャラクター 96x100 */
export const SPRITE_COSTUME_SVG = `<svg version="1.1" width="96" height="100" viewBox="0 0 96 100" xmlns="http://www.w3.org/2000/svg">
  <g fill="#FF8C1A" stroke="#C96A00" stroke-width="2">
    <polygon points="18,30 14,6 34,20"/>
    <polygon points="78,30 82,6 62,20"/>
    <ellipse cx="48" cy="42" rx="32" ry="26"/>
    <ellipse cx="48" cy="78" rx="24" ry="18"/>
  </g>
  <circle cx="36" cy="38" r="4" fill="#222"/>
  <circle cx="60" cy="38" r="4" fill="#222"/>
  <ellipse cx="48" cy="50" rx="5" ry="3.5" fill="#222"/>
  <path d="M43 55 Q48 60 53 55" stroke="#222" stroke-width="2" fill="none"/>
</svg>`;

export function svgAsset(svg: string): AssetFile {
  return { bytes: enc.encode(svg), ext: 'svg' };
}

export function defaultStageBackdrop(): AssetFile { return svgAsset(STAGE_BACKDROP_SVG); }
export function defaultSpriteCostume(): AssetFile { return svgAsset(SPRITE_COSTUME_SVG); }

/**
 * 最小の無音 WAV (44バイトヘッダ + 0 サンプル)
 * sound 宣言はあるが実体がない場合のフォールバック。
 */
export function emptyWav(): AssetFile {
  const header = new Uint8Array(44);
  const v = new DataView(header.buffer);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) header[off + i] = s.charCodeAt(i); };
  writeStr(0, 'RIFF');
  v.setUint32(4, 36, true);
  writeStr(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);       // fmt chunk size
  v.setUint16(20, 1, true);        // PCM
  v.setUint16(22, 1, true);        // mono
  v.setUint32(24, 22050, true);    // rate
  v.setUint32(28, 44100, true);    // byte rate
  v.setUint16(32, 2, true);        // block align
  v.setUint16(34, 16, true);       // bits
  writeStr(36, 'data');
  v.setUint32(40, 0, true);
  return { bytes: header, ext: 'wav' };
}
