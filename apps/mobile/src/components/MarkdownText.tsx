import React, {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors} from '../theme';

/**
 * Tiny renderer for the markdown subset our CHANGELOG uses: "## "/"### "
 * headings, "- " list items, blank-line paragraphs, inline **bold** and
 * `code`. Zero dependencies on purpose — the release notes format is ours.
 */

interface Run {
  text: string;
  bold?: boolean;
  code?: boolean;
}

type Block =
  | {type: 'h2' | 'h3' | 'li' | 'p'; runs: Run[]};

const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`)/g;

function parseInline(line: string): Run[] {
  const runs: Run[] = [];
  for (const part of line.split(INLINE_RE)) {
    if (part.length === 0) {
      continue;
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push({text: part.slice(2, -2), bold: true});
    } else if (part.startsWith('`') && part.endsWith('`')) {
      runs.push({text: part.slice(1, -1), code: true});
    } else {
      runs.push({text: part});
    }
  }
  return runs;
}

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line.trim().length === 0) {
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push({type: 'h3', runs: parseInline(line.slice(4))});
    } else if (line.startsWith('## ')) {
      blocks.push({type: 'h2', runs: parseInline(line.slice(3))});
    } else if (line.startsWith('- ')) {
      blocks.push({type: 'li', runs: parseInline(line.slice(2))});
    } else {
      blocks.push({type: 'p', runs: parseInline(line)});
    }
  }
  return blocks;
}

function Runs({runs}: {runs: Run[]}) {
  return (
    <>
      {runs.map((run, i) => (
        <Text
          key={i}
          style={run.code ? styles.code : run.bold ? styles.bold : undefined}>
          {run.text}
        </Text>
      ))}
    </>
  );
}

export function MarkdownText({text}: {text: string}) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <View style={styles.container}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'h2':
            return (
              <Text key={i} style={styles.h2}>
                <Runs runs={block.runs} />
              </Text>
            );
          case 'h3':
            return (
              <Text key={i} style={styles.h3}>
                <Runs runs={block.runs} />
              </Text>
            );
          case 'li':
            return (
              <View key={i} style={styles.liRow}>
                <Text style={styles.bullet}>·</Text>
                <Text style={styles.li}>
                  <Runs runs={block.runs} />
                </Text>
              </View>
            );
          default:
            return (
              <Text key={i} style={styles.p}>
                <Runs runs={block.runs} />
              </Text>
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {gap: 8},
  h2: {color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 6},
  h3: {color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 10},
  liRow: {flexDirection: 'row', gap: 8},
  bullet: {color: colors.textFaint, fontSize: 14, lineHeight: 22},
  li: {color: colors.textDim, fontSize: 14, lineHeight: 22, flex: 1},
  p: {color: colors.textDim, fontSize: 14, lineHeight: 22},
  bold: {fontWeight: '600', color: colors.text},
  code: {color: colors.accent, fontSize: 13},
});
