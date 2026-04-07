import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import Papa from "papaparse"
import { STATE_NAME_BY_CODE } from '../data/stateNames'

const COMMUNITY_SUFFIXES = ['township', 'borough', 'village', 'plantation', 'city', 'town', 'boro', 'cdp'];

function formatCommunityName(communityName) {
  if (!communityName) {
    return 'Unknown community';
  }

  const withSpacing = COMMUNITY_SUFFIXES.reduce((label, suffix) => {
    const regex = new RegExp(`${suffix}$`, 'i');
    return label.replace(regex, ` ${suffix}`);
  }, communityName);

  return withSpacing
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRow(rawItem, index) {
  // clean the raw csv first, otherwise the vis layer keeps checking for '?'
  const item = Object.fromEntries(
    Object.entries(rawItem).map(([key, value]) => [key, value === '?' ? null : value]),
  );

  const stateCode = Number(item.state);

  return {
    ...item,
    index,
    stateCode,
    // state / community labels are reused in tooltip, hierarchy and report text
    stateName: STATE_NAME_BY_CODE[stateCode] ?? `State ${stateCode}`,
    communityLabel: formatCommunityName(item.communityname),
  };
}

// get the data in asyncThunk
export const getDataSet = createAsyncThunk('communities/fetchData', async (args, thunkAPI) => {
  try{
    const response = await fetch('data/communities.csv');
    const responseText = await response.text();
    console.log("loaded file length:" + responseText.length);
    const responseJson = Papa.parse(responseText,{header:true, dynamicTyping:true});

    // you can also dispatch any other reducer
    // thunkAPI.dispatch(reducerAction(params))

    return responseJson.data
      // the parser leaves one half-empty row at the end some times
      .filter((item) => item.communityname !== undefined)
      .map((item, i) => normalizeRow(item, i));
    // when a result is returned, extraReducer below is triggered with the case setSeoulBikeData.fulfilled
  }catch(error){
    console.error("error catched in asyncThunk" + error);
    return thunkAPI.rejectWithValue(error)
  }
})

export const dataSetSlice = createSlice({
  name: 'dataSet',
  initialState: [],
  reducers: {
      // add reducer if needed
  },
  extraReducers: builder => {
    builder.addCase(getDataSet.pending, (state, action) => {
      console.log("extraReducer getDataSet.pending");
      // do something with state, e.g. to change a status
    })
    builder.addCase(getDataSet.fulfilled, (state, action) => {
      return action.payload
    })
    builder.addCase(getDataSet.rejected, (state, action) => {
      // Add any fetched house to the array
      const error = action.payload
      console.log("extraReducer getDataSet.rejected with error" + error);
    })
  }
})

// Action creators are generated for each case reducer function
// export const { reducerAction } = dataSetSlice.actions

export default dataSetSlice.reducer
