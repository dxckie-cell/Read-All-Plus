import { React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { findByProps } from "@vendetta/metro";
import { useProxy } from "@vendetta/storage";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { debug } from "./debug";

const { ScrollView } = findByProps("ScrollView");
const { TableRowGroup, TableRow, Stack, TextInput } = findByProps(
  "TableSwitchRow",
  "TableCheckboxRow",
  "TableRowGroup",
  "Stack",
  "TableRow"
);

type Field = "excludedServers" | "excludedDMs";

storage.excludedServers ??= [];
storage.excludedDMs ??= [];

export const isServerExcluded = (id: string): boolean => storage.excludedServers?.includes(id);
export const isDMExcluded = (id: string): boolean => storage.excludedDMs?.includes(id);

function ExcludeSection({ field, title, placeholder }: { field: Field; title: string; placeholder: string }) {
  const [value, setValue] = React.useState("");
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);
  const list: string[] = storage[field];

  const add = () => {
    const id = value.trim();
    if (!id || list.includes(id)) return;
    storage[field] = [...list, id];
    setValue("");
    forceUpdate();
  };

  const remove = (id: string) => {
    storage[field] = list.filter((x) => x !== id);
    forceUpdate();
  };

  return (
    <Stack spacing={8}>
      <TableRowGroup title={title}>
        <Stack spacing={4}>
          <TextInput
            placeholder={placeholder}
            value={value}
            onChange={setValue}
            isClearable
            onSubmitEditing={add}
            returnKeyType="done"
          />
        </Stack>
      </TableRowGroup>

      <TableRowGroup>
        <TableRow label="Add exception" trailing={<TableRow.Arrow />} onPress={add} />
      </TableRowGroup>

      {list.length > 0 && (
        <TableRowGroup title="Excluded">
          {list.map((id) => (
            <TableRow
              key={id}
              label={id}
              trailing={
                <RN.TouchableOpacity onPress={() => remove(id)}>
                  <RN.Image
                    source={getAssetIDByName("TrashIcon")}
                    style={{ width: 20, height: 20, tintColor: "#ff4d4d" }}
                  />
                </RN.TouchableOpacity>
              }
            />
          ))}
        </TableRowGroup>
      )}
    </Stack>
  );
}

export default function Settings() {
  useProxy(storage);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }}>
      <Stack spacing={8}>
        <ExcludeSection field="excludedServers" title="Exclude Server" placeholder="Enter Server ID" />
        <ExcludeSection field="excludedDMs" title="Exclude DM / Group" placeholder="Enter Channel ID" />
        {Object.keys(debug).length > 0 && (
          <TableRowGroup title="Diagnostics">
            {Object.entries(debug).map(([k, v], i) => (
              <TableRow key={i} label={`Info ${i + 1}`} subLabel={`${k}\n${v}`} />
            ))}
          </TableRowGroup>
        )}
      </Stack>
    </ScrollView>
  );
}
