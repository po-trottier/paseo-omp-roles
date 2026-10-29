import type { PluginButtonContentProps } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/ui";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { roleLabel, type OmpRole } from "../shared/roles";

export interface RolePickerSource {
  roles(): readonly OmpRole[];
  active(agentId: string): string | undefined;
  pick(agentId: string, role: string): Promise<void>;
}

/** Popover that lists the omp roles: name, short model, provider, and a thinking tag. */
export function createRolePicker(source: RolePickerSource) {
  return function RolePicker(props: PluginButtonContentProps) {
    const { theme, layout, close } = props;
    const toast = useToast();
    const styles = useMemo(() => {
      const { colors } = theme;
      return {
        list: { minWidth: layout.compact ? undefined : 300, paddingBottom: 6 },
        header: { color: colors.foregroundMuted, fontSize: 12, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
        row: {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: 10,
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 6,
          marginHorizontal: 4,
        },
        selected: { backgroundColor: colors.surface2 },
        pressed: { backgroundColor: colors.surface1 },
        check: { width: 14, alignItems: "center" as const },
        text: { flex: 1, minWidth: 0 },
        name: { color: colors.foreground, fontSize: 14, fontWeight: "600" as const },
        model: { color: colors.foregroundMuted, fontSize: 12 },
        tag: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 999,
          paddingHorizontal: 8,
          paddingVertical: 1,
        },
        tagText: { color: colors.foregroundMuted, fontSize: 11 },
      };
    }, [theme, layout.compact]);

    if (props.context !== "agent") return null;
    const { agentId } = props;
    const active = source.active(agentId);

    return (
      <View style={styles.list}>
        <Text style={styles.header}>
          {active ? "Switch role for this session" : "This chat uses no role. Pick one to switch."}
        </Text>
        {source.roles().map((role) => {
          const selected = role.name === active;
          const slash = role.model.indexOf("/");
          const provider = slash > 0 ? role.model.slice(0, slash) : "";
          const model = role.model.slice(role.model.lastIndexOf("/") + 1);
          const name = roleLabel(role.name);
          return (
            <Pressable
              key={role.name}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Switch to ${name}: ${model}${role.thinking ? `, ${role.thinking} thinking` : ""}`}
              onPress={() => {
                close();
                source.pick(agentId, role.name).catch((error: unknown) => {
                  toast.error(`Could not switch to ${name}: ${error instanceof Error ? error.message : String(error)}`);
                });
              }}
              style={({ pressed }) => [styles.row, selected && styles.selected, pressed && styles.pressed]}
            >
              <View style={styles.check}>
                {selected ? <Icon name="Check" size={14} color={theme.colors.accent} /> : null}
              </View>
              <View style={styles.text}>
                <Text style={styles.name}>{name}</Text>
                <Text style={styles.model} numberOfLines={1}>
                  {provider ? `${model} · ${provider}` : model}
                </Text>
              </View>
              {role.thinking ? (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{role.thinking}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    );
  };
}
