import { domainToASCII } from 'node:url';
import { BadRequestException } from '@nestjs/common';
import type { DomainParts } from '../registrars/domain/registrar.types';
export function normalizeDomain(value: string): string {
  const input = value.trim().toLowerCase().normalize('NFC');
  if (
    /[\s/:?#@%\\]/.test(input) ||
    input.endsWith('.') ||
    input.startsWith('.')
  )
    throw new BadRequestException('Nome de domínio inválido');
  const ascii = domainToASCII(input);
  if (
    !ascii ||
    ascii.length > 253 ||
    !ascii
      .split('.')
      .every(
        (label) =>
          label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
      )
  )
    throw new BadRequestException('Nome de domínio inválido');
  return ascii;
}
export function parseDomains(
  query: string,
  extensions: string[] | undefined,
  catalog: string[],
): DomainParts[] {
  const normalized = normalizeDomain(query),
    ordered = [...catalog].sort((a, b) => b.length - a.length);
  const matched = ordered.find((ext) => normalized.endsWith('.' + ext));
  let name = normalized;
  let selected = extensions;
  if (matched) {
    name = normalized.slice(0, -matched.length - 1);
    selected = extensions
      ? [...new Set([matched, ...extensions])].slice(0, 10)
      : [matched];
  } else if (normalized.includes('.'))
    throw new BadRequestException('Extensão não suportada');
  if (name.includes('.'))
    throw new BadRequestException('Pesquise um nome sem subdomínios');
  selected = selected || ordered.slice(0, 3);
  if (!selected.length)
    throw new BadRequestException('Não existem extensões ativas no catálogo');
  return [...new Set(selected)].map((extension) => {
    if (!catalog.includes(extension))
      throw new BadRequestException('Extensão não suportada: ' + extension);
    const domainName = normalizeDomain(name + '.' + extension);
    return { name, extension, domainName };
  });
}
