import { React, ReactNative as RN } from "@vendetta/metro/common";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { showToast } from "@vendetta/ui/toasts";
import { Button } from "@vendetta/ui/components";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { isServerExcluded, isDMExcluded } from "./Settings";
import { useThemeColors } from "./theme";

const { View, Pressable, StyleSheet, Image } = RN;
const Haptic = findByProps("triggerHapticFeedback", "HapticFeedbackTypes");

// Matches the native "+" tile in the guild bar; colors come from the current theme (see theme.ts).
const TILE = 48;
const MARGIN = 4;

export const FOOTER_EXTRA = TILE + 2 * MARGIN;

const ALERT_KEY = "read_all_options_alert";

type Mode = "all" | "servers" | "dms";

const getUnreadChannels = (mode: Mode) => {
  const GuildStore = findByStoreName("GuildStore");
  const ChannelStore = findByStoreName("ChannelStore");
  const GuildChannelStore = findByStoreName("GuildChannelStore") || ChannelStore;
  const ReadStateStore = findByStoreName("ReadStateStore");
  if (!ReadStateStore) return [];

  const unread: { channelId: string; messageId: string | null; readStateType: number }[] = [];
  const addIfUnread = (channel: any) => {
    if (!channel?.id || !ReadStateStore.hasUnread?.(channel.id)) return;
    unread.push({
      channelId: channel.id,
      messageId: ReadStateStore.lastMessageId?.(channel.id) || null,
      readStateType: 0
    });
  };

  if (mode !== "dms" && GuildStore) {
    for (const guild of Object.values<any>(GuildStore.getGuilds())) {
      if (!guild?.id || isServerExcluded(guild.id)) continue;
      try {
        const data = GuildChannelStore?.getChannels?.(guild.id);
        [...(data?.SELECTABLE ?? []), ...(data?.VOCAL ?? [])].forEach((c: any) => addIfUnread(c?.channel || c));
      } catch {}
    }
  }

  if (mode !== "servers") {
    try {
      for (const channel of Object.values<any>(ChannelStore?.getPrivateChannels?.() ?? {})) {
        if (channel?.id && !isDMExcluded(channel.id)) addIfUnread(channel);
      }
    } catch {}
  }

  return unread;
};

const markRead = (mode: Mode) => {
  const channels = getUnreadChannels(mode);
  if (channels.length === 0) return showToast("No unread notifications!", getAssetIDByName("Small"));

  const FluxDispatcher = findByProps("dispatch", "subscribe");
  FluxDispatcher.dispatch({ type: "BULK_ACK", context: "APP", channels });
  showToast(`Cleared ${channels.length} unread!`, getAssetIDByName("Check"));
};

const OPTIONS: { text: string; color: string; mode: Mode }[] = [
  { text: "Mark All Read", color: "brand", mode: "all" },
  { text: "Servers Only", color: "grey", mode: "servers" },
  { text: "DMs Only", color: "grey", mode: "dms" }
];

export default function ReadButton() {
  const colors = useThemeColors();

  const handlePress = () => {
    Haptic?.triggerHapticFeedback?.(Haptic.HapticFeedbackTypes.SOFT);

    const { openAlert, dismissAlert } = (globalThis as any).bunny?.ui?.alerts ?? {};
    const AlertModal = (globalThis as any).bunny?.ui?.components?.wrappers?.AlertModal;

    // No alert API available: just mark everything as read.
    if (!openAlert || !AlertModal) return markRead("all");

    openAlert(
      ALERT_KEY,
      React.createElement(AlertModal, {
        title: "👁️ Read All Options",
        content: "Choose what you want to mark as read:",
        actions: React.createElement(
          View,
          { style: { gap: 8, width: "100%", paddingTop: 8 } },
          ...OPTIONS.map(({ text, color, mode }) =>
            React.createElement(Button, {
              key: mode,
              text,
              color,
              size: "small",
              onPress: () => {
                dismissAlert(ALERT_KEY);
                markRead(mode);
              }
            })
          ),
          React.createElement(Button, {
            key: "cancel",
            text: "Cancel",
            color: "red",
            size: "small",
            onPress: () => dismissAlert(ALERT_KEY)
          })
        )
      })
    );
  };

  return (
    <View style={st.row}>
      <Pressable onPress={handlePress} accessibilityRole="button" accessibilityLabel="Read All Options">
        <View style={[st.tile, { backgroundColor: colors.tile }]}>
          <View style={[st.circle, { backgroundColor: colors.circle }]}>
            <Image source={getAssetIDByName("ic_eye")} style={[st.eye, { tintColor: colors.glyph }]} />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  row: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: MARGIN
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  circle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center"
  },
  eye: {
    width: 15,
    height: 15
  }
});
