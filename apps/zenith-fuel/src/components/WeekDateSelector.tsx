import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * The week strip: previous/next, the range, and seven day cards.
 *
 * It existed twice, copied - once in the logbook and once in supplements - and the
 * dashboard, which is where most of the reading happens, had no date control at all.
 * A third copy would have made the same mistake twice over: the two that existed had
 * already drifted apart, one showing the amber "excluded" dot and the other not.
 *
 * What differs between the tabs is only the small line under each date, so that is a
 * render prop and everything else is shared.
 */
export interface WeekDay {
  dateStr: string;
  dayNum: number;
  dayShortName: string;
  dayLongName: string;
  calories: number;
  isComplete: boolean;
}

interface WeekDateSelectorProps {
  weekDays: WeekDay[];
  selectedDateStr: string;
  onSelect: (dateStr: string) => void;
  formattedWeekRange: string;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  /** The small line beneath each date. Defaults to the day's intake. */
  renderDayNote?: (day: WeekDay) => React.ReactNode;
  /** The amber dot marking a day ZANE will not learn from. */
  showIncompleteFlag?: boolean;
  /** Today, so it can be marked even when another day is selected. */
  todayDateStr?: string;
}

export const WeekDateSelector: React.FC<WeekDateSelectorProps> = ({
  weekDays,
  selectedDateStr,
  onSelect,
  formattedWeekRange,
  onPrevWeek,
  onNextWeek,
  renderDayNote,
  showIncompleteFlag = false,
  todayDateStr
}) => (
  <>
    <div
      className="fuel-card col-12"
      style={{
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexDirection: 'row',
        marginBottom: 0
      }}
    >
      <button className="fuel-nav-btn" onClick={onPrevWeek} style={{ padding: '8px 14px' }}>
        <ChevronLeft size={16} /> Previous Week
      </button>
      <strong style={{ fontSize: 14, color: 'var(--text-main)', letterSpacing: '0.5px' }}>
        {formattedWeekRange}
      </strong>
      <button className="fuel-nav-btn" onClick={onNextWeek} style={{ padding: '8px 14px' }}>
        Next Week <ChevronRight size={16} />
      </button>
    </div>

    <div
      className="col-12"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12, marginBottom: 12 }}
    >
      {weekDays.map(day => {
        const isSelected = day.dateStr === selectedDateStr;
        const isToday = todayDateStr !== undefined && day.dateStr === todayDateStr;
        return (
          <button
            key={day.dateStr}
            type="button"
            onClick={() => onSelect(day.dateStr)}
            aria-current={isSelected ? 'date' : undefined}
            style={{
              background: isSelected ? 'rgba(255, 159, 67, 0.08)' : 'var(--bg-card)',
              border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--border-color)'}`,
              borderRadius: '12px',
              padding: '12px 10px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
              position: 'relative',
              font: 'inherit',
              width: '100%'
            }}
          >
            {showIncompleteFlag && !day.isComplete && (
              <div
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#ff9f43'
                }}
                title="Zenith Excluded (Incomplete)"
              />
            )}
            <span
              style={{
                fontSize: 10,
                color: isToday ? 'var(--color-primary)' : 'var(--text-muted)',
                textTransform: 'uppercase',
                fontWeight: 800,
                display: 'block'
              }}
            >
              {day.dayShortName}
            </span>
            <strong
              style={{
                fontSize: 20,
                color: isSelected ? 'var(--color-primary)' : 'var(--text-main)',
                display: 'block',
                margin: '4px 0',
                fontFamily: 'Outfit, sans-serif'
              }}
            >
              {day.dayNum}
            </strong>
            <span
              style={{
                fontSize: 9,
                color: 'var(--text-muted)',
                display: 'block',
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {renderDayNote
                ? renderDayNote(day)
                : day.calories > 0
                  ? `${day.calories} kcal`
                  : '—'}
            </span>
          </button>
        );
      })}
    </div>
  </>
);
