import { useState } from 'react';
import { Folder, Plus } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { useLibraryCollections, useLibraryItems, useLibraryMutation } from '../hooks/useLibraryQueries';
import { libraryErrorMessage } from '../contracts';
import { LibraryState, PrivateLabel, SectionHeading, useLibraryUI } from '../components/LibraryUI';
import { LibraryBrowse } from './LibraryBrowse';

export function LibraryCollections({ selectedId, onSelect }: { selectedId?: string; onSelect: (id?: string) => void }) {
  const { act } = useLibraryUI(); const result = useLibraryCollections(); const selected = selectedId; const setSelected = onSelect;
  const rows = result.data?.pages.flatMap(page => page.items) ?? []; const collection = rows.find(row => row.id === selected);
  return <section className="wk-lib-collections">
    {collection ? <><Button variant="quiet" onClick={() => setSelected(undefined)}>← All collections</Button>
      <SectionHeading title={collection.name}><div className="wk-lib-actions"><Button variant="secondary" onClick={() => act({ type: 'collection', collection })}>Edit collection</Button><Button onClick={() => act({ type: 'addCollectionItems', collectionId: collection.id })}>Add items</Button><Button variant="quiet" onClick={() => act({ type: 'deleteCollection', collection })}>Delete collection</Button></div></SectionHeading>
      <p>{collection.description}</p><PrivateLabel /><LibraryBrowse key={collection.id} collectionId={collection.id} />
      <RemoveCollectionItems collectionId={collection.id} /><div className="wk-lib-privacy-note"><PrivateLabel /><p>A collection organizes your items. It doesn’t share them. Removing an item from a collection keeps the original.</p></div>
    </> : <><SectionHeading title="Your collections" description="Keep related pictures, documents, and videos together."><Button onClick={() => act({ type: 'collection' })}><Plus size={16} aria-hidden="true" /> New collection</Button></SectionHeading>
      <LibraryState pending={result.isPending} error={result.error} retry={() => void result.refetch()} />
      <LibraryState empty={!result.isPending && !result.isError && !rows.length} title="Bring your ideas together"><p>Create a collection, then add items from anywhere in Library.</p></LibraryState>
      <div className="wk-lib-collection-grid">{rows.map(row => <button key={row.id} onClick={() => setSelected(row.id)}><Folder size={24} aria-hidden="true" /><strong>{row.name}</strong><span>{row.description}</span><small>{row.itemCount} items · Only you</small></button>)}</div>
      {result.hasNextPage && <Button variant="secondary" loading={result.isFetchingNextPage} onClick={() => void result.fetchNextPage()}>Load more collections</Button>}
    </>}
  </section>;
}
function RemoveCollectionItems({ collectionId }: { collectionId: string }) {
  const items = useLibraryItems({ collectionId, limit: 100 }); const { notify } = useLibraryUI(); const [id, setId] = useState(''); const [error, setError] = useState('');
  const mutation = useLibraryMutation<string>((api, itemId, signal) => api.collectionItems(collectionId, [itemId], 'remove', signal));
  return <details className="wk-lib-membership"><summary>Remove an item from this collection</summary>
    <LibraryState pending={items.isPending} error={items.error} retry={() => void items.refetch()} />
    <form className="wk-lib-toolbar" onSubmit={async event => { event.preventDefault(); setError(''); try { await mutation.mutateAsync(id); setId(''); notify('Removed from collection. The original item is still in Library.'); } catch (failure) { setError(libraryErrorMessage(failure)); } }}>
      <label className="wk-lib-field">Item<select aria-label="Item" value={id} onChange={event => setId(event.target.value)} disabled={mutation.isPending}><option value="">Choose an item</option>{items.data?.pages.flatMap(page => page.items).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <Button variant="secondary" type="submit" disabled={!id} loading={mutation.isPending}>Remove from collection</Button></form>
    {items.hasNextPage && <Button variant="quiet" onClick={() => void items.fetchNextPage()} loading={items.isFetchingNextPage}>Load more collection items</Button>}{error && <p role="alert">{error}</p>}
  </details>;
}
