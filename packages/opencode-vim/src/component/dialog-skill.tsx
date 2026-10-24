import { DialogSelect, type DialogSelectOption } from "../../../tui/src/ui/dialog-select"
import { createMemo, createResource } from "solid-js"
import { useDialog } from "../../../tui/src/ui/dialog"
import { useData } from "../../../tui/src/context/data"
import { useLocation } from "../../../tui/src/context/location"

export type DialogSkillProps = {
  onSelect: (skill: string) => void
  initialFilter?: string
}

export function DialogSkill(props: DialogSkillProps) {
  const dialog = useDialog()
  const data = useData()
  const location = useLocation()
  dialog.setSize("large")

  const [skills] = createResource(async () => {
    const current = data.location.skill.list(location.ref)
    if (current) return current
    await data.location.skill.sync(location.ref)
    return data.location.skill.list(location.ref) ?? []
  })

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    const list = skills() ?? []
    const query = props.initialFilter?.trim().toLowerCase()
    const filtered = query
      ? list.filter(
          (skill) =>
            skill.name.toLowerCase().includes(query) ||
            skill.description?.toLowerCase().includes(query),
        )
      : list
    const maxWidth = Math.max(0, ...filtered.map((s) => s.name.length))
    return filtered.map((skill) => ({
      title: skill.name.padEnd(maxWidth),
      description: skill.description?.replace(/\s+/g, " ").trim(),
      value: skill.id,
      category: "Skills",
      onSelect: () => {
        props.onSelect(skill.id)
        dialog.clear()
      },
    }))
  })

  return <DialogSelect title="Skills" placeholder="Search skills..." options={options()} />
}
