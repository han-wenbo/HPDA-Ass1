import './App.css';
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';

import { getDataSet } from './redux/DataSetSlice';
import SelectionSummary from './components/SelectionSummary';
import ScatterplotContainer from './components/scatterplot/ScatterplotContainer';
import HierarchyContainer from './components/hierarchy/HierarchyContainer';

function App() {
  const dispatch = useDispatch();

  useEffect(() => {
    // fetch once at startup, then every coordinated view reads the same slice
    dispatch(getDataSet());
  }, [dispatch]);

  return (
    <div className="App">
      <div className="pageShell">
        {/* summary stays first so the active subset is visible before chart reading starts */}
        <SelectionSummary />

        <div id="MultiviewContainer" className="dashboardGrid">
          <div className="scatterplotColumn">
            {/* this one keeps the population context next to crime */}
            <ScatterplotContainer
              initialXAttributeName="medIncome"
            />
            {/* this view is closer to the "where would i live" question */}
            <ScatterplotContainer
              initialXAttributeName="PctPopUnderPov"
            />
          </div>

          <HierarchyContainer />
        </div>
      </div>
    </div>
  );
}

export default App;
