import { useSelector } from 'react-redux';
import { formatMetric } from '../utils/formatting';

function average(items, accessor) {
  if (items.length === 0) {
    return null;
  }

  // tiny helper is enough here, pulling d3 in would be overkill tbh
  const total = items.reduce((sum, item) => sum + accessor(item), 0);
  return total / items.length;
}

function SelectionSummary() {
  const visData = useSelector((state) => state.dataSet);
  const selectedItems = useSelector((state) => state.itemInteraction.selectedItems);
  const hoveredItems = useSelector((state) => state.itemInteraction.hoveredItems);

  // no active selection yet? then the header just summarizes the whole dataset
  const focusItems = selectedItems.length > 0 ? selectedItems : visData;
  const uniqueStates = new Set(focusItems.map((item) => item.stateName));
  const selectionLabel = selectedItems.length > 0
    ? `${selectedItems.length} communities selected`
    : `${visData.length} communities`;

  const hoverLabel = (() => {
    // hover can be one place, a whole state group, or basically nothing
    if (hoveredItems.length === 0) {
      return 'None';
    }

    if (hoveredItems.length === 1) {
      return `${hoveredItems[0].communityLabel}, ${hoveredItems[0].stateName}`;
    }

    const hoveredStates = new Set(hoveredItems.map((item) => item.stateName));
    if (hoveredStates.size === 1) {
      return `${hoveredItems[0].stateName} (${hoveredItems.length} communities)`;
    }

    return `${hoveredItems.length} hovered communities`;
  })();

  return (
    <section className="summaryPanel">
      <div className="summaryCopy">
        <h1>Community-level violent crime analysis</h1>
        <p>Interactive comparison of violent crime rate, population, household income, and geographic distribution across the Communities and Crime dataset.</p>
      </div>

      <div className="summaryMetrics">
        {/* just lightweight rollups, this should stay quick even when hover changes a lot */}
        <div className="statCard">
          <span className="statLabel">Sample size</span>
          <strong>{focusItems.length}</strong>
        </div>
        <div className="statCard">
          <span className="statLabel">States</span>
          <strong>{uniqueStates.size}</strong>
        </div>
        <div className="statCard">
          <span className="statLabel">Mean violent crime rate</span>
          <strong>{formatMetric(average(focusItems, (item) => item.ViolentCrimesPerPop))}</strong>
        </div>
        <div className="statCard">
          <span className="statLabel">Mean household income</span>
          <strong>{formatMetric(average(focusItems, (item) => item.medIncome))}</strong>
        </div>
        <div className="statCard">
          <span className="statLabel">Current subset</span>
          <strong>{selectionLabel}</strong>
        </div>
        <div className="statCard">
          <span className="statLabel">Hover focus</span>
          <strong>{hoverLabel}</strong>
        </div>
      </div>
    </section>
  );
}

export default SelectionSummary;
