import React from "react";

export function ResponsaveisModal({
  item,
  responsaveisDisponiveis,
  selectedIds,
  saving,
  onToggle,
  onCancel,
  onSave,
}) {
  if (!item) return null;

  return (
    <div className="prospects-modal-backdrop" role="presentation">
      <div className="prospects-modal" role="dialog" aria-modal="true" aria-labelledby="responsaveis-title">
        <div className="prospects-modal__header">
          <div>
            <p className="prospects-eyebrow">Responsáveis</p>
            <h3 id="responsaveis-title" className="prospects-modal__title">Imóvel {item.codigo}</h3>
          </div>
        </div>
        <div className="prospects-modal__body">
          <p className="prospects-modal__hint">
            Selecione um ou mais prospectores que podem atuar neste imóvel.
          </p>
          {!responsaveisDisponiveis.length ? (
            <p className="prospects-empty">Nenhum prospector ativo disponível para atribuição.</p>
          ) : (
            <div className="prospects-checklist">
              {responsaveisDisponiveis.map((responsavel) => (
                <label key={responsavel.id} className="prospects-check">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(responsavel.id)}
                    onChange={() => onToggle(responsavel.id)}
                    disabled={saving}
                  />
                  <span>{responsavel.name || responsavel.email} ({responsavel.email})</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="prospects-modal__footer">
          <button type="button" className="prospects-btn secondary" onClick={onCancel} disabled={saving}>
            Fechar
          </button>
          <button type="button" className="prospects-btn primary" onClick={onSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar responsáveis"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmarExclusaoModal({ item, loading, onCancel, onConfirm }) {
  if (!item) return null;

  return (
    <div className="prospects-modal-backdrop" role="presentation">
      <div className="prospects-modal" role="dialog" aria-modal="true" aria-labelledby="confirmar-exclusao-title">
        <div className="prospects-modal__header">
          <div>
            <p className="prospects-eyebrow">Confirmação</p>
            <h3 id="confirmar-exclusao-title" className="prospects-modal__title">Remover da fila</h3>
          </div>
        </div>
        <div className="prospects-modal__body">
          <p>
            O imóvel <strong>{item.codigo}</strong>
            {item.cidade || item.uf ? ` (${[item.cidade, item.uf].filter(Boolean).join("/")})` : ""}
            {" "}será removido apenas da fila de selecionados.
          </p>
          <p>O histórico capturado na prospecção continuará preservado.</p>
        </div>
        <div className="prospects-modal__footer">
          <button type="button" className="prospects-btn secondary" onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
          <button type="button" className="prospects-btn danger" onClick={onConfirm} disabled={loading}>
            {loading ? "Removendo..." : "Confirmar remoção"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function IncluirSelecionadoManualModal({ draft, loading, onChange, onCancel, onSave, prioridadeOptions }) {
  if (!draft) return null;

  return (
    <div className="prospects-modal-backdrop" role="presentation">
      <div className="prospects-modal" role="dialog" aria-modal="true" aria-labelledby="incluir-manual-title">
        <div className="prospects-modal__header">
          <div>
            <p className="prospects-eyebrow">Inclusão manual</p>
            <h3 id="incluir-manual-title" className="prospects-modal__title">Adicionar imóvel fora da base</h3>
          </div>
        </div>
        <div className="prospects-modal__body">
          <p className="prospects-modal__hint">
            Use este fluxo quando o imóvel ainda não estiver na base capturada. O funil passa a controlar o código,
            o teto operacional e as notas, e o restante pode ser refinado depois na ficha de viabilidade.
          </p>
          <div className="prospects-analise-grid">
            <label className="prospects-form-field">
              <span>Código do imóvel</span>
              <input
                type="text"
                value={draft.numero_bem}
                onChange={(e) => onChange("numero_bem", e.target.value)}
                placeholder="Ex.: 8555535398410"
              />
            </label>
            <label className="prospects-form-field">
              <span>Valor máximo</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.valor_maximo}
                onChange={(e) => onChange("valor_maximo", e.target.value)}
                placeholder="0,00"
              />
            </label>
            <label className="prospects-form-field">
              <span>Prioridade</span>
              <select
                value={String(draft.prioridade)}
                onChange={(e) => onChange("prioridade", Number(e.target.value))}
              >
                {prioridadeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="prospects-form-field">
            <span>Observação inicial</span>
            <textarea
              className="prospects-textarea"
              value={draft.observacoes}
              onChange={(e) => onChange("observacoes", e.target.value)}
              placeholder="Contexto curto para quem vai assumir esse imóvel no funil."
              rows={6}
            />
          </label>
        </div>
        <div className="prospects-modal__footer">
          <button type="button" className="prospects-btn secondary" onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
          <button type="button" className="prospects-btn primary" onClick={onSave} disabled={loading}>
            {loading ? "Incluindo..." : "Adicionar à fila"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ObservacoesModal({ item, value, mapLink, loading, onChange, onMapLinkChange, onCancel, onSave }) {
  if (!item) return null;

  return (
    <div className="prospects-modal-backdrop" role="presentation">
      <div className="prospects-modal" role="dialog" aria-modal="true" aria-labelledby="observacoes-title">
        <div className="prospects-modal__header">
          <div>
            <p className="prospects-eyebrow">Observações</p>
            <h3 id="observacoes-title" className="prospects-modal__title">Imóvel {item.codigo}</h3>
          </div>
        </div>
        <div className="prospects-modal__body">
          <p className="prospects-modal__hint">
            Use este campo para manter a anotação mais atual e relevante sobre o imóvel.
          </p>
          <textarea
            className="prospects-textarea prospects-textarea--large"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Adicione uma nota objetiva sobre o imóvel. Você pode editar esse texto sempre que houver novidade."
            rows={10}
          />
          <label className="prospects-form-field">
            <span>Link Google Maps</span>
            <input
              type="url"
              value={mapLink}
              onChange={(e) => onMapLinkChange(e.target.value)}
              placeholder="https://maps.google.com/..."
            />
          </label>
          {mapLink ? (
            <a className="prospects-link" href={mapLink} target="_blank" rel="noreferrer">
              Abrir localização
            </a>
          ) : null}
        </div>
        <div className="prospects-modal__footer">
          <button type="button" className="prospects-btn secondary" onClick={onCancel} disabled={loading}>
            Fechar
          </button>
          <button type="button" className="prospects-btn primary" onClick={onSave} disabled={loading}>
            {loading ? "Salvando..." : "Salvar nota"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PrioridadeModal({ item, loading, onCancel, onSelect, prioridadeOptions }) {
  if (!item) return null;

  return (
    <div className="prospects-modal-backdrop" role="presentation">
      <div className="prospects-modal prospects-modal--compact" role="dialog" aria-modal="true" aria-labelledby="prioridade-title">
        <div className="prospects-modal__header">
          <div>
            <p className="prospects-eyebrow">Prioridade</p>
            <h3 id="prioridade-title" className="prospects-modal__title">Imóvel {item.codigo}</h3>
          </div>
        </div>
        <div className="prospects-modal__body">
          <p className="prospects-modal__hint">
            Escolha a prioridade operacional deste imóvel.
          </p>
          <div className="prospects-priority-options">
            {prioridadeOptions.map((option) => {
              const isActive = Number(item.prioridade || 2) === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`prospects-priority-option ${isActive ? "is-active" : ""}`}
                  onClick={() => onSelect(option.value)}
                  disabled={loading}
                >
                  <span className={`prospects-priority-dot prospects-priority-dot--${option.cls}`} />
                  <strong>{option.label}</strong>
                  <small>{isActive ? "Atual" : "Selecionar"}</small>
                </button>
              );
            })}
          </div>
        </div>
        <div className="prospects-modal__footer">
          <button type="button" className="prospects-btn secondary" onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
