import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { PromptPreset } from '../lib/api'
import { useTheme } from '../lib/theme'
import { Button, Field, Muted } from './ui'

interface Props {
  title: string
  description: string
  presets: PromptPreset[]
  /** Name of the built-in choice ('' = nothing custom), kept available even when the presets could not be loaded. */
  defaultLabel: string
  /** Set when the presets could not be loaded: a retry link is shown. */
  loadFailed?: boolean
  onRetry?: () => void
  /** The saved prompt ('' = the default one). */
  value: string
  placeholder: string
  /** Saves a prompt. Throws if it could not be saved. */
  onSave: (text: string) => Promise<void>
}

/**
 * A drop-down of ready-made prompts, with a "write my own" choice at the end.
 * Picking a ready-made one saves it at once; a custom text is saved with its own button.
 */
export function PromptPicker({ title, description, presets: loaded, defaultLabel, loadFailed, onRetry, value, placeholder, onSave }: Props) {
  const t = useTheme()
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The default choice always exists, so there is something to go back to whatever happens.
  const presets: PromptPreset[] = loaded.some((p) => p.text === '')
    ? loaded
    : [{ id: 'default', kind: 'system', text: '', label: { fr: defaultLabel, en: defaultLabel }, hint: { fr: '', en: '' } }, ...loaded]

  const current = presets.find((p) => p.text.trim() === value.trim())
  // A saved text that matches no preset is a custom one.
  const isCustom = custom || (value.trim() !== '' && !current)
  const label = isCustom ? 'Personnalisé' : (current ?? presets[0]).label.fr
  const hint = isCustom ? 'Votre propre texte.' : current?.hint.fr

  const save = async (text: string) => {
    setSaving(true)
    setError(null)
    try {
      await onSave(text)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'enregistrement a échoué")
      return false
    } finally {
      setSaving(false)
    }
  }

  const choose = async (preset: PromptPreset) => {
    setOpen(false)
    setCustom(false)
    await save(preset.text)
  }

  const chooseCustom = () => {
    setOpen(false)
    setCustom(true)
    setDraft(value) // start from what is there, to tweak it
  }

  const row = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingVertical: 12, paddingHorizontal: 12 }

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: t.text, fontWeight: '700', marginBottom: 4 }}>{title}</Text>
      <Muted style={{ marginBottom: 10 }}>{description}</Muted>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title} : ${label}. Changer`}
        onPress={() => setOpen((v) => !v)}
        style={[row, { borderWidth: 1.5, borderColor: open ? t.primary : t.border, borderRadius: 12, backgroundColor: t.card }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: '600' }}>{label}</Text>
          {hint ? <Muted style={{ marginTop: 2 }}>{hint}</Muted> : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={t.muted} />
      </Pressable>

      {open && (
        <View style={{ marginTop: 6, borderWidth: 1, borderColor: t.border, borderRadius: 12, backgroundColor: t.card, overflow: 'hidden' }}>
          {presets.map((p, i) => {
            const on = !isCustom && p === (current ?? presets[0])
            return (
              <Pressable key={p.id} onPress={() => choose(p)} style={[row, i > 0 && { borderTopWidth: 1, borderTopColor: t.border }]}>
                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? t.primary : t.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: '600' }}>{p.label.fr}</Text>
                  {p.hint.fr ? <Muted style={{ marginTop: 2 }}>{p.hint.fr}</Muted> : null}
                </View>
              </Pressable>
            )
          })}
          {loadFailed && (
            <Pressable onPress={onRetry} style={[row, { borderTopWidth: 1, borderTopColor: t.border }]}>
              <Ionicons name="refresh" size={20} color={t.primary} />
              <Text style={{ color: t.primary, flex: 1 }}>Les modèles n&apos;ont pas pu être chargés. Réessayer</Text>
            </Pressable>
          )}
          <Pressable onPress={chooseCustom} style={[row, { borderTopWidth: 1, borderTopColor: t.border }]}>
            <Ionicons name={isCustom ? 'radio-button-on' : 'radio-button-off'} size={20} color={isCustom ? t.primary : t.muted} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: '600' }}>Personnalisé</Text>
              <Muted style={{ marginTop: 2 }}>Écrire votre propre texte.</Muted>
            </View>
          </Pressable>
        </View>
      )}

      {isCustom && (
        <View style={{ marginTop: 12 }}>
          <Field
            label="Votre texte"
            value={draft}
            onChangeText={setDraft}
            multiline
            placeholder={placeholder}
            style={{ minHeight: 120, textAlignVertical: 'top', paddingTop: 12 }}
          />
          <Button
            title="Enregistrer"
            variant="secondary"
            onPress={async () => {
              if (await save(draft.trim())) setCustom(draft.trim() !== '' && !presets.some((p) => p.text.trim() === draft.trim()))
            }}
            loading={saving}
            disabled={draft.trim() === value.trim()}
          />
        </View>
      )}
      {error ? <Text style={{ color: t.danger, marginTop: 8 }}>{error}</Text> : null}
    </View>
  )
}
