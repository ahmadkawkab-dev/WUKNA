import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import type { LibraryCategory } from '../types';
import { categoryNames, SectionHeading } from './LibraryUI';
import { LibraryBrowse } from '../views/LibraryBrowse';

/** Dashboard results share the one search field in the Library header. */
export function LibrarySearch({ term = '', onShowOverview }: { term?: string; onShowOverview?: () => void }) {
  const [category, setCategory] = useState<LibraryCategory>();
  return <section className="wk-library-search"><SectionHeading title={term ? 'Search results' : 'All recent items'} description="Find a name, a tag, or a line of code across everything you saved.">
    {onShowOverview && <Button variant="quiet" onClick={onShowOverview}>Back to overview</Button>}
  </SectionHeading>
    <div className="wk-lib-actions"><Button variant="secondary" aria-pressed={!category} onClick={() => setCategory(undefined)}>All</Button>
      {(['picture', 'document', 'video'] as const).map(value => <Button key={value} variant="secondary" aria-pressed={category === value} onClick={() => setCategory(value)}>{categoryNames[value]}</Button>)}</div>
    <p role="status">{term ? `Results for “${term}”` : 'Recently added items'}</p>
    <LibraryBrowse key={category ?? 'all'} category={category} search={term} />
  </section>;
}
