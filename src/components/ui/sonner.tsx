import { useEffect } from "react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, toast } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  // Fix Sonner's focus sentinel accessibility issue
  // Sonner creates aria-hidden focus traps with tabindex="0" which violates WCAG
  useEffect(() => {
    const fixFocusSentinels = () => {
      const sentinels = document.querySelectorAll('[aria-hidden="true"][tabindex="0"]')
      sentinels.forEach((sentinel) => {
        sentinel.setAttribute('tabindex', '-1')
      })
    }

    // Run immediately and on mutations
    fixFocusSentinels()
    const observer = new MutationObserver(fixFocusSentinels)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [])

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
