import React from 'react';
import { CardDefinition, Splinter, AttackType, Rarity, getCardAttacks, MONSTER_ATTACK_TYPES } from '../types/card';
import { Swords, Zap, Crosshair, Sparkles, Heart, Shield, Wind, Sparkle } from 'lucide-react';
import { ABILITY_METAS } from '../data/abilities';
import { isOfficialSplCardId } from '../data/cardIds';

interface CardPreviewProps {
  card: CardDefinition;
  level?: number;
  compact?: boolean;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  badge?: string;
  showCustomBadge?: boolean;
}

export const SPLINTER_BG_COLORS: Record<Splinter, { frame: string; border: string; glow: string; header: string; gem: string }> = {
  Fire: {
    frame: 'from-amber-950/90 via-red-950/80 to-stone-950',
    border: 'border-red-600',
    glow: 'shadow-red-600/30 ring-red-500/40',
    header: 'bg-gradient-to-r from-red-700 to-amber-600',
    gem: 'bg-red-500',
  },
  Water: {
    frame: 'from-blue-950/90 via-sky-950/80 to-stone-950',
    border: 'border-sky-500',
    glow: 'shadow-cyan-600/30 ring-cyan-500/40',
    header: 'bg-gradient-to-r from-sky-700 to-blue-600',
    gem: 'bg-cyan-400',
  },
  Earth: {
    frame: 'from-emerald-950/90 via-green-950/80 to-stone-950',
    border: 'border-emerald-600',
    glow: 'shadow-emerald-600/30 ring-emerald-500/40',
    header: 'bg-gradient-to-r from-emerald-700 to-green-600',
    gem: 'bg-emerald-500',
  },
  Life: {
    frame: 'from-yellow-950/90 via-amber-950/80 to-stone-950',
    border: 'border-amber-400',
    glow: 'shadow-amber-500/30 ring-amber-400/40',
    header: 'bg-gradient-to-r from-amber-600 to-yellow-500',
    gem: 'bg-yellow-400',
  },
  Death: {
    frame: 'from-purple-950/90 via-indigo-950/80 to-stone-950',
    border: 'border-purple-600',
    glow: 'shadow-purple-600/30 ring-purple-500/40',
    header: 'bg-gradient-to-r from-purple-800 to-indigo-700',
    gem: 'bg-purple-500',
  },
  Dragon: {
    frame: 'from-orange-950/90 via-amber-950/80 to-stone-950',
    border: 'border-amber-500',
    glow: 'shadow-amber-600/40 ring-amber-500/50',
    header: 'bg-gradient-to-r from-amber-700 to-red-600',
    gem: 'bg-amber-400',
  },
  Neutral: {
    frame: 'from-slate-900/90 via-gray-900/80 to-stone-950',
    border: 'border-slate-500',
    glow: 'shadow-slate-600/30 ring-slate-400/30',
    header: 'bg-gradient-to-r from-slate-700 to-zinc-600',
    gem: 'bg-slate-400',
  },
};

export const RARITY_COLORS: Record<Rarity, string> = {
  Common: 'text-slate-300 border-slate-400',
  Rare: 'text-sky-400 border-sky-400',
  Epic: 'text-purple-400 border-purple-400',
  Legendary: 'text-amber-400 border-amber-400 font-bold',
};

export const CardPreview: React.FC<CardPreviewProps> = ({
  card,
  level = 1,
  compact = false,
  onClick,
  selected = false,
  disabled = false,
  badge,
  showCustomBadge = true,
}) => {
  const statLevel =
    card.stats.find((s) => s.level === level) ||
    (card.stats.length > 0
      ? card.stats.reduce((prev, curr) => (curr.level <= level && curr.level > prev.level ? curr : prev), card.stats[0])
      : { level, mana: 0, attack: 0, attackType: 'None' as AttackType, speed: 0, armor: 0, health: 1, abilities: [] });

  const effectiveLevel = level || statLevel.level || 1;

  const colors = SPLINTER_BG_COLORS[card.splinter] || SPLINTER_BG_COLORS.Neutral;

  const renderAttackIcon = (type: AttackType, val: number) => {
    if (type === 'None' || val === 0) return null;
    let icon = <Swords className="w-3.5 h-3.5 text-orange-400" />;
    let bg = 'bg-red-950/90 text-orange-400 border-orange-500/60';
    if (type === 'Ranged') {
      icon = <Crosshair className="w-3.5 h-3.5 text-amber-400" />;
      bg = 'bg-amber-950/90 text-amber-300 border-amber-500/60';
    } else if (type === 'Magic') {
      icon = <Sparkles className="w-3.5 h-3.5 text-blue-400" />;
      bg = 'bg-blue-950/90 text-blue-300 border-blue-500/60';
    }

    return (
      <div key={type} title={`${type}: ${val}`} className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded border shadow font-bold text-xs ${bg}`}>
        {icon}
        <span>{val}</span>
      </div>
    );
  };

  return (
    <div
      onClick={!disabled ? onClick : undefined}
      className={`relative group rounded-xl border-2 transition-all duration-200 overflow-hidden select-none ${
        colors.border
      } bg-gradient-to-b ${colors.frame} ${
        onClick && !disabled ? 'cursor-pointer hover:scale-[1.02] hover:shadow-lg' : ''
      } ${selected ? 'ring-4 ring-rose-500 shadow-xl shadow-rose-500/20' : ''} ${
        disabled ? 'opacity-40 grayscale cursor-not-allowed' : ''
      } ${compact ? 'w-48 text-xs p-2.5' : 'w-56 p-3 text-sm'}`}
    >
      {/* Top Banner: Mana, Name, Level */}
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Mana Crystal */}
          <div className="w-6 h-6 rounded-full bg-blue-600 border border-cyan-300 text-white font-bold flex items-center justify-center text-xs shadow-md shadow-blue-500/50 shrink-0">
            {statLevel.mana}
          </div>
          <div className="font-bold truncate text-slate-100 tracking-tight" title={card.name}>
            {card.name}
          </div>
        </div>
        <div className="text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-slate-900/90 border border-amber-500/60 text-amber-300 shadow-sm shrink-0">
          Lv {effectiveLevel}
        </div>
      </div>

      {/* Card Artwork / Art Box */}
      <div className="relative w-full h-28 rounded-lg overflow-hidden border border-slate-700/80 bg-slate-950 flex items-center justify-center mb-2">
        {card.imageUrl ? (
          <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-500 gap-1">
            <Zap className="w-8 h-8 opacity-60 text-slate-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {card.splinter} {card.cardType}
            </span>
          </div>
        )}

        {/* Custom Card Badge (Only for user-forged or custom boss cards, never for official Splinterlands collection cards) */}
        {card.isCustom && !isOfficialSplCardId(card.id) && showCustomBadge && (
          <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-rose-950/90 border border-rose-500 text-rose-300 text-[9px] font-bold rounded">
            CUSTOM
          </div>
        )}

        {/* Rarity Gem */}
        <div
          className={`absolute bottom-1 right-1 text-[9px] px-1.5 py-0.5 rounded font-semibold border bg-slate-950/90 ${
            RARITY_COLORS[card.rarity]
          }`}
        >
          {card.rarity}
        </div>
      </div>

      {/* Stats Bar */}
      {card.cardType === 'Monster' ? (
        <div className="grid grid-cols-4 gap-1 mb-2">
          {/* Attack */}
          <div className="flex flex-col items-center justify-center p-1 rounded bg-slate-900/90 border border-slate-800">
            <div className="text-[9px] text-slate-400 font-semibold">ATK</div>
            <div className="flex flex-wrap justify-center items-center gap-0.5 font-bold">
              {MONSTER_ATTACK_TYPES.some((type) => (getCardAttacks(statLevel)[type] || 0) > 0)
                ? MONSTER_ATTACK_TYPES.map((type) => renderAttackIcon(type, getCardAttacks(statLevel)[type] || 0))
                : <span className="text-slate-500">-</span>}
            </div>
          </div>

          {/* Speed */}
          <div className="flex flex-col items-center justify-center p-1 rounded bg-slate-900/90 border border-slate-800 text-sky-400">
            <div className="text-[9px] text-slate-400 font-semibold flex items-center gap-0.5">
              <Wind className="w-2.5 h-2.5" />
            </div>
            <span className="font-bold text-xs">{statLevel.speed}</span>
          </div>

          {/* Armor */}
          <div className="flex flex-col items-center justify-center p-1 rounded bg-slate-900/90 border border-slate-800 text-yellow-400">
            <div className="text-[9px] text-slate-400 font-semibold flex items-center gap-0.5">
              <Shield className="w-2.5 h-2.5" />
            </div>
            <span className="font-bold text-xs">{statLevel.armor}</span>
          </div>

          {/* Health */}
          <div className="flex flex-col items-center justify-center p-1 rounded bg-slate-900/90 border border-slate-800 text-rose-400">
            <div className="text-[9px] text-slate-400 font-semibold flex items-center gap-0.5">
              <Heart className="w-2.5 h-2.5" />
            </div>
            <span className="font-bold text-xs">{statLevel.health}</span>
          </div>
        </div>
      ) : (
        /* Summoner Buff Preview */
        <div className="p-1.5 rounded bg-slate-900/90 border border-slate-800 mb-2 text-xs">
          <div className="text-[10px] text-amber-400 font-bold mb-0.5">Summoner Blessing:</div>
          <div className="text-[11px] text-slate-300">
            {card.summonerBuffs?.melee ? `+${card.summonerBuffs.melee} Melee ` : ''}
            {card.summonerBuffs?.magic ? `+${card.summonerBuffs.magic} Magic ` : ''}
            {card.summonerBuffs?.ranged ? `+${card.summonerBuffs.ranged} Ranged ` : ''}
            {card.summonerBuffs?.speed ? `+${card.summonerBuffs.speed} Speed ` : ''}
            {card.summonerBuffs?.armor ? `+${card.summonerBuffs.armor} Armor ` : ''}
            {card.summonerBuffs?.health ? `+${card.summonerBuffs.health} Health ` : ''}
            {card.summonerBuffs?.enemyMelee ? `${card.summonerBuffs.enemyMelee} Enemy Melee ` : ''}
            {card.summonerBuffs?.enemyMagic ? `${card.summonerBuffs.enemyMagic} Enemy Magic ` : ''}
            {card.summonerBuffs?.abilitiesGranted
              ? `Grants [${card.summonerBuffs.abilitiesGranted.join(', ')}] `
              : ''}
            {!card.summonerBuffs && <span className="text-slate-500 italic">No modifiers</span>}
          </div>
        </div>
      )}

      {/* Abilities Badges */}
      {statLevel.abilities.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {statLevel.abilities.map((ab) => (
            <span
              key={ab}
              title={ABILITY_METAS[ab]?.description || ab}
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-950/70 border border-rose-500/40 text-rose-200"
            >
              {ab}
            </span>
          ))}
        </div>
      )}

      {/* Optional Custom badge overlay (bottom-left if custom, or separate) */}
      {badge && (
        <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-slate-950/90 border border-amber-500/60 text-amber-300 font-bold text-[9px] rounded shadow z-10">
          {badge}
        </div>
      )}
    </div>
  );
};
