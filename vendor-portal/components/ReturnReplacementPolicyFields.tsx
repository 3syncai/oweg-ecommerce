"use client"

import { Input, Label, Switch, Text } from "@medusajs/ui"

export type ReturnReplacementPolicy = {
  returnWindowDays: string
  replacementWindowDays: string
  useSameWindow: boolean
}

export const EMPTY_RETURN_REPLACEMENT_POLICY: ReturnReplacementPolicy = {
  returnWindowDays: "",
  replacementWindowDays: "",
  useSameWindow: true,
}

type Props = {
  value: ReturnReplacementPolicy
  onChange: (next: ReturnReplacementPolicy) => void
}

/** Product-level customer return and replacement eligibility windows. */
export default function ReturnReplacementPolicyFields({ value, onChange }: Props) {
  const updateReturnDays = (returnWindowDays: string) => {
    onChange({
      ...value,
      returnWindowDays,
      replacementWindowDays: value.useSameWindow ? returnWindowDays : value.replacementWindowDays,
    })
  }

  return (
    <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-5">
      <div className="mb-5">
        <Label className="text-base font-semibold">Return & replacement policy</Label>
        <Text size="small" className="mt-1 text-ui-fg-muted">
          Set the number of days after delivery in which customers can request a return or replacement.
        </Text>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="return-window-days">Return window (days)</Label>
          <Input
            id="return-window-days"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={value.returnWindowDays}
            onChange={(event) => updateReturnDays(event.target.value)}
            placeholder="e.g. 7"
          />
          <Text size="xsmall" className="mt-1 text-ui-fg-muted">
            Leave blank or enter 0 to not offer returns.
          </Text>
        </div>

        {!value.useSameWindow && (
          <div>
            <Label htmlFor="replacement-window-days">Replacement window (days)</Label>
            <Input
              id="replacement-window-days"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={value.replacementWindowDays}
              onChange={(event) =>
                onChange({ ...value, replacementWindowDays: event.target.value })
              }
              placeholder="e.g. 10"
            />
            <Text size="xsmall" className="mt-1 text-ui-fg-muted">
              Leave blank or enter 0 to not offer replacements.
            </Text>
          </div>
        )}
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-lg bg-ui-bg-subtle p-3">
        <Switch
          id="same-return-replacement-window"
          checked={value.useSameWindow}
          onCheckedChange={(useSameWindow) =>
            onChange({
              ...value,
              useSameWindow,
              replacementWindowDays: useSameWindow
                ? value.returnWindowDays
                : value.replacementWindowDays,
            })
          }
        />
        <div>
          <Label htmlFor="same-return-replacement-window">Use the same window for replacement</Label>
          <Text size="xsmall" className="text-ui-fg-muted">
            Turn this off to choose different return and replacement periods.
          </Text>
        </div>
      </div>
    </div>
  )
}
