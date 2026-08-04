import { useEffect, useRef, useState } from 'react'
import BottomSheet from '@/components/common/BottomSheet'
import Icon from '@/components/common/Icon'
import { cn } from '@/lib/utils'
import {
  COLLECTION_NAME_MAX,
  createCollection,
  deleteCollection,
  getCollections,
  renameCollection,
  type BookCollection,
} from '@/lib/libraryStore'

interface CollectionSheetProps {
  isOpen: boolean
  onClose: () => void
  /** 현재 보고 있는 모음. null이면 서재 전체. */
  activeId: string | null
  /** 모음을 고르거나(id) 전체로 돌아갈 때(null) 호출. */
  onSelect: (id: string | null) => void
  /** 목록이 바뀌었음을 부모에 알린다(활성 모음이 지워졌을 수 있음). */
  onChanged: () => void
}

/**
 * 책 모음집 관리 시트.
 *
 * 유튜브 재생목록처럼 서재에서 원하는 책만 골라 묶어 두는 기능. 목록 보기·만들기·
 * 이름 변경·삭제를 담당하고, 어떤 책을 담을지는 서재 그리드의 담기 모드에서 정한다.
 *
 * 모음집은 이 브라우저에만 저장된다(`libraryStore`).
 */
export default function CollectionSheet({
  isOpen,
  onClose,
  activeId,
  onSelect,
  onChanged,
}: CollectionSheetProps) {
  const [collections, setCollections] = useState<BookCollection[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const reload = () => setCollections(getCollections())

  useEffect(() => {
    if (!isOpen) return
    reload()
    setIsCreating(false)
    setEditingId(null)
    setDraftName('')
    setErrorMessage(null)
  }, [isOpen])

  useEffect(() => {
    if (isCreating || editingId) inputRef.current?.focus()
  }, [isCreating, editingId])

  const submitDraft = () => {
    const name = draftName.trim()
    if (!name) {
      setErrorMessage('모음 이름을 입력해주세요.')
      return
    }
    try {
      if (editingId) renameCollection(editingId, name)
      else createCollection(name)
      setDraftName('')
      setIsCreating(false)
      setEditingId(null)
      setErrorMessage(null)
      reload()
      onChanged()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '저장하지 못했습니다.')
    }
  }

  const handleDelete = (collection: BookCollection) => {
    if (!window.confirm(`'${collection.name}' 모음을 삭제할까요? 책은 서재에 그대로 남습니다.`))
      return
    deleteCollection(collection.id)
    if (activeId === collection.id) onSelect(null)
    reload()
    onChanged()
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="책 모음" showCloseButton>
      <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3">
        {/* 전체 서재로 돌아가기 */}
        <button
          type="button"
          onClick={() => {
            onSelect(null)
            onClose()
          }}
          className={cn(
            'mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors',
            activeId == null ? 'bg-primary/10' : 'hover:bg-primary/5'
          )}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-primary/70">
            <Icon name="menu_book" className="text-xl" />
          </span>
          <span className="flex-1 text-[15px] font-bold">서재 전체</span>
          {activeId == null && <Icon name="check" className="text-xl text-primary" />}
        </button>

        {collections.length > 0 && <div className="my-2 border-t border-border" />}

        <ul className="space-y-1">
          {collections.map(collection => {
            const isEditing = editingId === collection.id
            return (
              <li key={collection.id}>
                {isEditing ? (
                  <NameForm
                    inputRef={inputRef}
                    value={draftName}
                    onChange={setDraftName}
                    onSubmit={submitDraft}
                    onCancel={() => {
                      setEditingId(null)
                      setDraftName('')
                      setErrorMessage(null)
                    }}
                  />
                ) : (
                  <div
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2 transition-colors',
                      activeId === collection.id ? 'bg-primary/10' : 'hover:bg-primary/5'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(collection.id)
                        onClose()
                      }}
                      className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon name="folder" className="text-xl" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold">
                          {collection.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {collection.libraryBookIds.length}권
                        </span>
                      </span>
                      {activeId === collection.id && (
                        <Icon name="check" className="shrink-0 text-xl text-primary" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(collection.id)
                        setDraftName(collection.name)
                        setIsCreating(false)
                      }}
                      aria-label={`${collection.name} 이름 변경`}
                      className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    >
                      <Icon name="edit" className="text-lg" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(collection)}
                      aria-label={`${collection.name} 삭제`}
                      className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Icon name="delete" className="text-lg" />
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {isCreating ? (
          <div className="mt-2">
            <NameForm
              inputRef={inputRef}
              value={draftName}
              onChange={setDraftName}
              onSubmit={submitDraft}
              onCancel={() => {
                setIsCreating(false)
                setDraftName('')
                setErrorMessage(null)
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setIsCreating(true)
              setEditingId(null)
              setDraftName('')
            }}
            className="mt-3 flex w-full items-center gap-3 rounded-xl border border-dashed border-primary/30 px-3 py-3.5 text-left transition-colors hover:bg-primary/5"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon name="add" className="text-xl" />
            </span>
            <span className="text-[15px] font-bold text-primary">새 모음 만들기</span>
          </button>
        )}

        {errorMessage && (
          <p role="alert" className="mt-3 text-center text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        <p className="mt-5 text-center text-[11px] leading-5 text-muted-foreground/60">
          모음집은 이 기기의 브라우저에만 저장됩니다.
        </p>
      </div>
    </BottomSheet>
  )
}

function NameForm({
  inputRef,
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  inputRef: React.Ref<HTMLInputElement>
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-card px-3 py-2">
      <input
        ref={inputRef}
        type="text"
        value={value}
        maxLength={COLLECTION_NAME_MAX}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) onSubmit()
          if (e.key === 'Escape') onCancel()
        }}
        placeholder="모음 이름"
        aria-label="모음 이름"
        className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] outline-none placeholder:text-muted-foreground/40"
      />
      <button
        type="button"
        onClick={onCancel}
        className="shrink-0 px-1 text-sm text-muted-foreground hover:text-foreground"
      >
        취소
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={!value.trim()}
        className="shrink-0 px-1 text-sm font-bold text-primary disabled:opacity-40"
      >
        확인
      </button>
    </div>
  )
}
