import { createContext, Show, useContext, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { Autocomplete } from "@/component/autocomplete"

type AutocompleteHostProps = Parameters<typeof Autocomplete>[0]

function init() {
  const [store, setStore] = createStore({
    props: undefined as AutocompleteHostProps | undefined,
  })

  return {
    setProps(props: AutocompleteHostProps) {
      setStore("props", props)
    },
    clearProps(props: AutocompleteHostProps) {
      if (store.props !== props) return
      setStore("props", undefined)
    },
    get props() {
      return store.props
    },
  }
}

type AutocompleteHostContext = ReturnType<typeof init>

const ctx = createContext<AutocompleteHostContext>()

export function AutocompleteHostProvider(props: ParentProps) {
  const value = init()

  return (
    <ctx.Provider value={value}>
      {props.children}
      <Show when={value.props}>
        {(autocompleteProps) => <Autocomplete {...autocompleteProps()} />}
      </Show>
    </ctx.Provider>
  )
}

export function useAutocompleteHost() {
  const value = useContext(ctx)
  if (!value) {
    throw new Error("useAutocompleteHost must be used within an AutocompleteHostProvider")
  }
  return value
}
