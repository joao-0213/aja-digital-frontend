import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { textMatch } from '@/lib/utils';

export interface ParsedSelectOption {
  value: string;
  label: string;
  disabled: boolean;
  group?: string;
}

function extractOptionText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractOptionText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return extractOptionText(node.props.children);
  return '';
}

export function parseSelectOptions(children: ReactNode, group?: string): ParsedSelectOption[] {
  const result: ParsedSelectOption[] = [];
  Children.forEach(children, (child) => {
    if (
      !isValidElement<{
        value?: string | number;
        disabled?: boolean;
        label?: string;
        children?: ReactNode;
      }>(child)
    )
      return;
    if (child.type === Fragment) {
      result.push(...parseSelectOptions(child.props.children, group));
      return;
    }
    if (child.type === 'optgroup') {
      result.push(...parseSelectOptions(child.props.children, child.props.label));
      return;
    }
    if (child.type === 'option') {
      const label = extractOptionText(child.props.children).trim();
      const value = child.props.value !== undefined ? String(child.props.value) : label;
      result.push({ value, label, disabled: Boolean(child.props.disabled), group });
    }
  });
  return result;
}

export function filterSelectOptions(
  options: ParsedSelectOption[],
  query: string
): ParsedSelectOption[] {
  const trimmed = query.trim();
  if (!trimmed) return options;
  return options.filter((item) => textMatch(`${item.label} ${item.group ?? ''}`, trimmed));
}
