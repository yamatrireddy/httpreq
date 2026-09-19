import {
  Anchor,
  Button,
  Group,
  Kbd,
  Modal,
  SegmentedControl,
  Stack,
  Switch,
  Table,
  Text,
  useMantineColorScheme,
  type MantineColorScheme,
} from '@mantine/core';
import { IconLayoutColumns, IconLayoutRows } from '@tabler/icons-react';
import { Fragment, useEffect, useState } from 'react';
import { DOCUMENTATION_URL, type AppInfo, type DesktopBridge } from '@httpreq/shared';
import { AppLogo } from './AppLogo';
import type { CommandMap } from './commands';
import { DEFAULT_SPLIT_RATIO, usePreferences, type ResponsePosition } from './preferences';
import { formatChord, type KeyChord } from './shortcuts';

interface ModalProps {
  opened: boolean;
  onClose: () => void;
}

export function SettingsDialog({ opened, onClose }: ModalProps) {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const preferences = usePreferences();

  return (
    <Modal opened={opened} onClose={onClose} title="Settings" size="md">
      <Stack gap="lg">
        <Stack gap={6}>
          <Text size="sm" fw={600} id="settings-theme">
            Color theme
          </Text>
          <SegmentedControl
            aria-labelledby="settings-theme"
            value={colorScheme}
            onChange={(value) => setColorScheme(value as MantineColorScheme)}
            data={[
              { label: 'Light', value: 'light' },
              { label: 'Dark', value: 'dark' },
              { label: 'System', value: 'auto' },
            ]}
          />
        </Stack>
        <Stack gap={6}>
          <Text size="sm" fw={600} id="settings-layout">
            Response panel position
          </Text>
          <SegmentedControl
            aria-labelledby="settings-layout"
            value={preferences.responsePosition}
            onChange={(value) => preferences.setResponsePosition(value as ResponsePosition)}
            data={[
              {
                value: 'right',
                label: (
                  <Group gap={6} justify="center" wrap="nowrap">
                    <IconLayoutColumns size={15} aria-hidden /> Right
                  </Group>
                ),
              },
              {
                value: 'bottom',
                label: (
                  <Group gap={6} justify="center" wrap="nowrap">
                    <IconLayoutRows size={15} aria-hidden /> Bottom
                  </Group>
                ),
              },
            ]}
          />
          <Text size="xs" c="dimmed">
            Applies to every open and new request.
          </Text>
        </Stack>
        <Switch
          label="Show sidebar"
          checked={preferences.sidebarVisible}
          onChange={preferences.toggleSidebar}
        />
        <Switch
          label="Show status bar"
          checked={preferences.statusBarVisible}
          onChange={preferences.toggleStatusBar}
        />
        <Group justify="space-between">
          <Button
            variant="default"
            onClick={() => {
              preferences.setSplitRatio('right', DEFAULT_SPLIT_RATIO.right);
              preferences.setSplitRatio('bottom', DEFAULT_SPLIT_RATIO.bottom);
            }}
          >
            Reset panel sizes
          </Button>
          <Button onClick={onClose}>Done</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

interface ShortcutRow {
  label: string;
  keys: string[];
}

const staticRows = (mac: boolean): { group: string; rows: ShortcutRow[] }[] => [
  {
    group: 'Request tabs (when the tab list has focus)',
    rows: [
      { label: 'Move between tabs', keys: ['←', '→'] },
      { label: 'First / last tab', keys: ['Home', 'End'] },
      { label: 'Open the focused tab', keys: ['Enter', 'Space'] },
      { label: 'Close the focused tab', keys: [mac ? '⌦' : 'Delete'] },
    ],
  },
  {
    group: 'General',
    rows: [
      { label: 'Close menu or dialog', keys: ['Esc'] },
      ...(mac ? [] : [{ label: 'Focus the application menu (desktop)', keys: ['Alt'] }]),
    ],
  },
];

export function ShortcutsDialog({
  opened,
  onClose,
  commands,
  mac,
  web,
}: ModalProps & { commands: CommandMap; mac: boolean; web: boolean }) {
  const chord = (value: KeyChord) => formatChord(value, mac);
  const commandRows: ShortcutRow[] = Object.entries(commands)
    .filter(([id, command]) => command.shortcut?.length && !id.startsWith('request.goto-'))
    .map(([, command]) => ({ label: command.label, keys: command.shortcut!.map(chord) }));
  commandRows.push({
    label: 'Go to request 1–9',
    keys: [`${chord({ key: '1', mod: true })} … ${chord({ key: '9', mod: true })}`],
  });

  const groups = [{ group: 'Commands', rows: commandRows }, ...staticRows(mac)];

  return (
    <Modal opened={opened} onClose={onClose} title="Keyboard shortcuts" size="lg">
      {web && (
        <Text size="xs" c="dimmed" mb="sm">
          Browsers reserve some combinations (such as {chord({ key: 't', mod: true })},{' '}
          {chord({ key: 'w', mod: true })} and {chord({ key: 'Tab', ctrl: true })}); those work in
          the desktop app.
        </Text>
      )}
      <Table verticalSpacing={4} fz="sm">
        <Table.Tbody>
          {groups.map(({ group, rows }) => (
            <Fragment key={group}>
              <Table.Tr>
                <Table.Th colSpan={2} pt="md">
                  {group}
                </Table.Th>
              </Table.Tr>
              {rows.map((row) => (
                <Table.Tr key={`${group}-${row.label}`}>
                  <Table.Td>{row.label}</Table.Td>
                  <Table.Td ta="right">
                    <Group gap={4} justify="flex-end" wrap="wrap">
                      {row.keys.map((key) => (
                        <Kbd key={key} size="xs">
                          {key}
                        </Kbd>
                      ))}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Fragment>
          ))}
        </Table.Tbody>
      </Table>
    </Modal>
  );
}

export function AboutDialog({
  opened,
  onClose,
  version,
  desktop,
  onOpenDocumentation,
}: ModalProps & { version?: string; desktop?: DesktopBridge; onOpenDocumentation: () => void }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    if (opened && desktop && !info) void desktop.getAppInfo().then(setInfo);
  }, [opened, desktop, info]);

  return (
    <Modal opened={opened} onClose={onClose} title="About HttpReq" size="sm" centered>
      <Stack align="center" gap="xs" ta="center">
        <AppLogo size={56} />
        <Text fw={700} size="lg">
          HttpReq
        </Text>
        <Text size="sm" c="dimmed">
          Local-first API client · version {info?.version ?? version ?? 'unknown'}
        </Text>
        {info && (
          <Text size="xs" c="dimmed" ff="monospace">
            Electron {info.versions.electron} · Chromium {info.versions.chrome} · Node{' '}
            {info.versions.node} · {info.platform}
          </Text>
        )}
        {!desktop && (
          <Text size="xs" c="dimmed">
            Running in the browser
          </Text>
        )}
        <Anchor
          size="sm"
          href={DOCUMENTATION_URL}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => {
            event.preventDefault();
            onOpenDocumentation();
          }}
        >
          Documentation
        </Anchor>
      </Stack>
    </Modal>
  );
}
