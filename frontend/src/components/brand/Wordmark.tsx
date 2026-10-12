import { BrandMark, type BrandMotion } from './BrandMark';

export function Wordmark({ arabic = false, motion = 'still' }: { arabic?: boolean; motion?: BrandMotion }) {
  return (
    <div className="wukna-wordmark">
      <BrandMark className="wukna-mark" motion={motion} />
      {arabic ? <span lang="ar" dir="rtl">وُكنة</span> : <span>wukna</span>}
    </div>
  );
}
