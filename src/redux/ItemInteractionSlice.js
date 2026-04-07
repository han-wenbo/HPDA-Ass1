import { createSlice } from '@reduxjs/toolkit'

function sameItemsByIndex(currentItems, nextItems) {
  if (currentItems === nextItems) {
    return true
  }

  if (currentItems.length !== nextItems.length) {
    return false
  }

  for (let index = 0; index < currentItems.length; index += 1) {
    // compare stable dataset ids, object refs are too easy to reshuffle by mapping
    if (currentItems[index]?.index !== nextItems[index]?.index) {
      return false
    }
  }

  return true
}

export const itemInteractionSlice = createSlice({
  name: 'itemInteraction',
  initialState: {
    selectedItems: [],
    hoveredItems: []
  },
  // initialState:[] if you need an array
  reducers: {
    setSelectedItems: (state, action) => {
      // same selection again would only kick off useless sync work
      if (sameItemsByIndex(state.selectedItems, action.payload)) {
        return state
      }
      return {...state, selectedItems: action.payload}
    },
    clearSelectedItems: (state) => {
      if (state.selectedItems.length === 0) {
        return state
      }
      return { ...state, selectedItems: [] }
    },
    setHoveredItems: (state, action) => {
      // hover updates a lot, so this tiny guard saves more redraws then you expect
      if (sameItemsByIndex(state.hoveredItems, action.payload)) {
        return state
      }
      return { ...state, hoveredItems: action.payload }
    },
    clearHoveredItems: (state) => {
      if (state.hoveredItems.length === 0) {
        return state
      }
      return { ...state, hoveredItems: [] }
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
})

// Action creators are generated for each case reducer function
export const {
  setSelectedItems,
  clearSelectedItems,
  setHoveredItems,
  clearHoveredItems,
  /* , addValueToAnArray, updateAnArray */
} = itemInteractionSlice.actions

export default itemInteractionSlice.reducer
