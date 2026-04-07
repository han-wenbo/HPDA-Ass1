import './Hierarchy.css';
import * as d3 from 'd3';
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import HierarchyD3 from './Hierarchy-d3';
import {
  clearHoveredItems,
  setHoveredItems,
  setSelectedItems,
} from '../../redux/ItemInteractionSlice';

const LAYOUT_OPTIONS = [
  { value: 'treemap', label: 'Treemap' },
  { value: 'pack', label: 'Circle Pack' },
  { value: 'partition', label: 'Partition' },
];

const RISK_COLORMAP = `linear-gradient(to right, ${d3.quantize((t) => d3.interpolateRdYlGn(0.08 + (1 - t) * 0.84), 18)
  .map((color, index, palette) => `${color} ${(index / (palette.length - 1)) * 100}%`)
  .join(', ')})`;

function HierarchyContainer() {
  const visData = useSelector((state) => state.dataSet);
  const selectedItems = useSelector((state) => state.itemInteraction.selectedItems);
  const hoveredItems = useSelector((state) => state.itemInteraction.hoveredItems);
  const dispatch = useDispatch();

  const [layoutMode, setLayoutMode] = useState('treemap');
  const divContainerRef = useRef(null);
  const hierarchyD3Ref = useRef(null);

  const getChartSize = function () {
    let width;
    let height;

    if (divContainerRef.current !== undefined) {
      width = divContainerRef.current.offsetWidth;
      height = divContainerRef.current.offsetHeight;
    }

    return { width, height };
  };

  useEffect(() => {
    // same pattern as the scatter view: create once, then just feed it state
    const hierarchyD3 = new HierarchyD3(divContainerRef.current);
    hierarchyD3.create({ size: getChartSize() });
    hierarchyD3Ref.current = hierarchyD3;

    return () => {
      hierarchyD3.clear();
    };
  }, []);

  useEffect(() => {
    const hierarchyD3 = hierarchyD3Ref.current;
    if (!hierarchyD3) {
      return;
    }

    const controllerMethods = {
      handleOnClick: (items) => dispatch(setSelectedItems(items)),
      handleOnMouseEnter: (items) => dispatch(setHoveredItems(items)),
      handleOnMouseLeave: () => dispatch(clearHoveredItems()),
    };

    // layout mode changes the geometry, but selection still comes from redux
    hierarchyD3.renderHierarchy(visData, layoutMode, controllerMethods);
  }, [dispatch, layoutMode, visData]);

  useEffect(() => {
    const hierarchyD3 = hierarchyD3Ref.current;
    if (!hierarchyD3) {
      return;
    }

    // sync after render, this keeps hover / click logic simpler to reason about
    hierarchyD3.syncInteractionState(selectedItems, hoveredItems);
  }, [hoveredItems, selectedItems]);

  return (
    <section className="viewCard hierarchyCard">
      <div className="hierarchyPanelHeader">
        <div className="hierarchyIntro">
          <h2>Geographic distribution of violent crime</h2>
          <p>
            Area encodes population. Color encodes violent crime rate across states and communities.
          </p>
        </div>

        <div className="hierarchyControlPanel">
          <div className="layoutControlLabel">Hierarchical layout</div>
          <div className="layoutSwitch">
            {LAYOUT_OPTIONS.map((layout) => (
              <button
                key={layout.value}
                className={layoutMode === layout.value ? 'layoutButton active' : 'layoutButton'}
                onClick={() => setLayoutMode(layout.value)}
                type="button"
              >
                {layout.label}
              </button>
            ))}
          </div>

          <div className="legendInline">
            <div className="legendInlineTitle">Violent crime risk</div>
            <div className="legendInlineScale">
              <span>Lower violent crime risk</span>
              <div className="legendInlineRamp" style={{ background: RISK_COLORMAP }} />
              <span>Higher violent crime risk</span>
            </div>
          </div>
        </div>
      </div>

      <div className="chartShell chartShellHierarchy">
        <div ref={divContainerRef} className="hierarchyDivContainer" />
      </div>
    </section>
  );
}

export default HierarchyContainer;
