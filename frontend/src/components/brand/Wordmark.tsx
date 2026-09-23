import { BrandMark } from './BrandMark';

export function Wordmark({ arabic = false }: { arabic?: boolean }) {
  return (
    <div className="wukna-wordmark">
      <BrandMark className="wukna-mark" />
      {arabic ? <span lang="ar" dir="rtl">وُكنة</span> : <span>Wukna</span>}
    </div>
  );
}
