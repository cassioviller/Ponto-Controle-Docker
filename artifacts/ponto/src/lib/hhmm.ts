/**
 * Helper de máscara para campos de hora no formato HH:MM.
 * Aceita digitação somente de números — o `:` é inserido automaticamente
 * após os 2 primeiros dígitos. Limita a 4 dígitos no total.
 *
 * Passe `prev` (o valor exibido anteriormente) para que o backspace
 * sobre o `:` remova também um dígito, evitando que o usuário fique
 * "preso" no `:` ao apagar de volta.
 *
 * Exemplos (com `prev` = valor anterior):
 *   ""              -> ""
 *   "0"             -> "0"
 *   "08"            -> "08:"      (insere `:` ao completar 2 dígitos)
 *   "080"           -> "08:0"
 *   "0800"          -> "08:00"
 *   "08:30" (paste) -> "08:30"
 *
 * Backspace partindo de "08:00":
 *   "08:0"  -> "08:0"
 *   "08:"   -> "08:"             (apagou o último dígito de minutos)
 *   "08"    -> "0"               (apagou o `:` -> remove um dígito também)
 *   "0"     -> "0"
 */
export function maskHHMM(input: string | null | undefined, prev?: string | null): string {
  const nextStr = input == null ? "" : String(input);
  let digits = nextStr.replace(/\D/g, "").slice(0, 4);

  if (prev != null) {
    const prevStr = String(prev);
    const prevDigits = prevStr.replace(/\D/g, "");
    // Detecta backspace sobre o `:`: nº de dígitos não mudou, mas a string
    // total ficou menor — o usuário apagou o separador. Remove um dígito.
    if (digits.length === prevDigits.length && nextStr.length < prevStr.length) {
      digits = digits.slice(0, -1);
    }
  }

  if (digits.length === 0) return "";
  if (digits.length === 1) return digits;
  if (digits.length === 2) return `${digits}:`;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}
