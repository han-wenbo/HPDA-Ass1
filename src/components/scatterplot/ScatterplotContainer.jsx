import './Scatterplot.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import ScatterplotD3 from './Scatterplot-d3';
import { formatAttributeLabel } from '../../utils/formatting';
import {
  clearHoveredItems,
  setHoveredItems,
  setSelectedItems,
} from '../../redux/ItemInteractionSlice';

const Y_ATTRIBUTE_NAME = 'ViolentCrimesPerPop';

const X_ATTRIBUTE_OPTIONS = [
  { value: 'medIncome', label: 'Median household income' },
  { value: 'PctPopUnderPov', label: 'Population under poverty line' },
  { value: 'PctUnemployed', label: 'Unemployment rate' },
  { value: 'OwnOccMedVal', label: 'Owner-occupied median value' },
  { value: 'MedRent', label: 'Median rent' },
  { value: 'PctSameHouse85', label: 'Population in same house since 1985' },
];

function ScatterplotContainer({ initialXAttributeName = 'medIncome' }) {
  const visData = useSelector((state) => state.dataSet);
  const selectedItems = useSelector((state) => state.itemInteraction.selectedItems);
  const hoveredItems = useSelector((state) => state.itemInteraction.hoveredItems);
  const dispatch = useDispatch();

  const [xAttributeName, setXAttributeName] = useState(initialXAttributeName);
  const divContainerRef = useRef(null);
  const scatterplotD3Ref = useRef(null);

  const selectedOption = useMemo(() => {
    return X_ATTRIBUTE_OPTIONS.find((option) => option.value === xAttributeName) ?? X_ATTRIBUTE_OPTIONS[0];
  }, [xAttributeName]);

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
    // keep one d3 instence alive, rerenders should not rebuild the whole chart
    const scatterplotD3 = new ScatterplotD3(divContainerRef.current);
    scatterplotD3.create({ size: getChartSize() });
    scatterplotD3Ref.current = scatterplotD3;

    return () => {
      scatterplotD3.clear();
    };
  }, []);

  useEffect(() => {
    const scatterplotD3 = scatterplotD3Ref.current;
    if (!scatterplotD3) {
      return;
    }

    const controllerMethods = {
      handleOnClick: (itemData) => dispatch(setSelectedItems([itemData])),
      handleOnMouseEnter: (itemData) => dispatch(setHoveredItems([itemData])),
      handleOnMouseLeave: () => dispatch(clearHoveredItems()),
      handleOnBrushSelection: (items) => dispatch(setSelectedItems(items)),
    };

    // render step depends on data + mapped attrs, interaction sync happens below
    scatterplotD3.renderScatterplot(visData, xAttributeName, Y_ATTRIBUTE_NAME, controllerMethods);
  }, [dispatch, visData, xAttributeName]);

  useEffect(() => {
    const scatterplotD3 = scatterplotD3Ref.current;
    if (!scatterplotD3) {
      return;
    }

    // shared redux state lets both scatterplots and the hierarchy react togther
    scatterplotD3.syncInteractionState(selectedItems, hoveredItems);
  }, [hoveredItems, selectedItems]);

  return (
    <section className="viewCard">
      <div className="viewHeader">
        <div className="viewHeaderRow">
          <div className="viewHeadingGroup">
            <h2>{selectedOption.label} vs violent crime rate</h2>
            <p>{selectedOption.label} against the community violent crime rate.</p>
          </div>

          <div className="viewMeta">
            <label className="viewMetaControl" htmlFor={`x-axis-${initialXAttributeName}`}>
              <span className="viewMetaLabel">X axis</span>
              <select
                id={`x-axis-${initialXAttributeName}`}
                className="axisSelect"
                value={xAttributeName}
                onChange={(event) => setXAttributeName(event.target.value)}
              >
                {X_ATTRIBUTE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="viewMetaItem">
              <span className="viewMetaLabel">Y axis</span>
              <span className="viewMetaValue">{formatAttributeLabel(Y_ATTRIBUTE_NAME)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="chartShell chartShellScatter">
        <div ref={divContainerRef} className="scatterplotDivContainer" />
      </div>
    </section>
  );
}

export default ScatterplotContainer;
