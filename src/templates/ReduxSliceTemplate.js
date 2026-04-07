import { createSlice } from '@reduxjs/toolkit'

export const getDataSet = createAsyncThunk('dataSet/fetchData', async (args, thunkAPI) => {
  try{
    const result = await fetch('path/to/data.csv');
    
    // do somehting

    // you can also dispatch any other reducer
    // thunkAPI.dispatch(reducerAction(params))

    return result;
    // when a result is returned, extraReducer below is triggered with the case setSeoulBikeData.fulfilled
  }catch(error){
    console.error("error catched in asyncThunk" + error);
    return thunkAPI.rejectWithValue(error)
  }
})


export const counterSlice = createSlice({
  name: 'counter',
  initialState: {
    value: 0
  },
  // initialState:[] if you need an array
  reducers: {
    updateAnObject: (state, action) => {
      return {...state, value: state.value + action.payload}
    },
    // addValueToAnArray: (state, action) => {
    //   return [...state, action.payload]
    // },
    // updateAnArray: state => {
    //   return state.map(item=>{
    //     if (itemData.index === action.payload.index) {
    //       return {...itemData, keyToUpdate: action.payload.valueToUpdate};
    //     } else {
    //       return itemData;
    //     }
    //   })
    // },
  },
  extraReducers: builder => {
    builder.addCase(getDataSet.pending, (state, action) => {
      console.log("extraReducer getDataSet.pending");
      // do something with state, e.g. to change a status
    })
    builder.addCase(getDataSet.fulfilled, (state, action) => {
      // do something with state or return action.payload directly
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
export const { updateAnObject/* , addValueToAnArray, updateAnArray */ } = counterSlice.actions

export default counterSlice.reducer