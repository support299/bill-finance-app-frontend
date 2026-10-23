import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RANGE_LABELS, type RangePreset } from "@/lib/format";

export function RangePicker({
  preset,
  custom,
  onPresetChange,
  onCustomChange,
}: {
  preset: RangePreset;
  custom: { from: string; to: string };
  onPresetChange: (p: RangePreset) => void;
  onCustomChange: (c: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={preset} onValueChange={(v) => onPresetChange(v as RangePreset)}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(RANGE_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom range</SelectItem>
        </SelectContent>
      </Select>

      {preset === "custom" && (
        <>
          <Input
            type="date"
            className="w-40"
            value={custom.from}
            onChange={(e) => onCustomChange({ ...custom, from: e.target.value })}
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            className="w-40"
            value={custom.to}
            onChange={(e) => onCustomChange({ ...custom, to: e.target.value })}
          />
        </>
      )}
    </div>
  );
}

export function AccountFilter({
  accounts,
  value,
  onChange,
}: {
  accounts: { plaid_account_id: string; account_name: string | null; mask: string | null }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <Select
      value={value.length === 1 ? (value[0] as string) : "all"}
      onValueChange={(v) => onChange(v === "all" ? [] : [v])}
    >
      <SelectTrigger className="w-56">
        <SelectValue placeholder="All accounts" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All accounts</SelectItem>
        {accounts.map((a) => (
          <SelectItem key={a.plaid_account_id} value={a.plaid_account_id}>
            {a.account_name ?? "Account"} {a.mask ? `••${a.mask}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
