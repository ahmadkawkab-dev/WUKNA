import { useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import type { LibraryCategory } from '../types';
import { categoryNames, SectionHeading } from './LibraryUI';
import { LibraryBrowse } from '../views/LibraryBrowse';

export function LibrarySearch({ initialTerm = '' }: { initialTerm?: string }) {
  const [draft, setDraft] = useState(initialTerm); const [term, setTerm] = useState(initialTerm);
  const [category, setCategory] = useState<LibraryCategory>();
  const submit = (event: FormEvent) => { event.preventDefault(); setTerm(draft.trim()); };
  return <section className="wk-library-search"><SectionHeading title="Search your library" description="Find a name, a tag, or a line of code across everything you saved." />
    <form onSubmit={submit}><Field label="Search Library" value={draft} maxLength={200} onChange={event => setDraft(event.target.value)} placeholder="Search your private library" /><Button type="submit">Search</Button></form>
    <div className="wk-lib-actions"><Button variant="secondary" aria-pressed={!category} onClick={() => setCategory(undefined)}>All</Button>
      {(['picture', 'document', 'video'] as const).map(value => <Button key={value} variant="secondary" aria-pressed={category === value} onClick={() => setCategory(value)}>{categoryNames[value]}</Button>)}</div>
    <p role="status">{term ? `Results for “${term}”` : 'Recently added items'}</p>
    <LibraryBrowse key={category ?? 'all'} category={category} search={term} />
  </section>;
}
