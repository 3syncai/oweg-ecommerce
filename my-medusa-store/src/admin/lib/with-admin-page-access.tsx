import { useEffect, useState, type ComponentType } from "react"
import { currentAdminAccess } from "./admin-access-client"
import { canAccessAdminPage } from "../../shared/admin-access"

/** Avoid mounting cross-section widgets or making their privileged requests. */
export function withAdminPageAccess<T extends object>(
  Component: ComponentType<T>,
  page: string
) {
  return function ScopedAdminWidget(props: T) {
    const [allowed, setAllowed] = useState(false)
    useEffect(() => {
      let active = true
      currentAdminAccess()
        .then((access) => {
          if (active) setAllowed(canAccessAdminPage(access, page))
        })
        .catch(() => {
          if (active) setAllowed(false)
        })
      return () => {
        active = false
      }
    }, [])
    return allowed ? <Component {...props} /> : null
  }
}
