import * as chrono from 'chrono-node'
import {browser} from 'webextension-polyfill-ts'
import {afterClosingBrackets} from '../common/brackets'
import {RoamDate} from '../roam/date'
import {RoamNode, Selection} from '../roam/roam-node'
import {Roam} from '../roam/roam'
import {NodeWithDate} from '../roam/date/withDate'

import {Feature, Settings} from '../settings'

export const config: Feature = {
    id: 'fuzzy-date',
    name: 'Fuzzy Date',
    enabledByDefault: true,
    settings: [{type: 'string', id: 'guard', initValue: ';', label: 'Guard symbol'}],
}

const checkSettingsAndToggleFuzzyDate = () => {
    Settings.isActive(config.id).then(active => (active ? registerEventListener() : removeEventListener()))
}

checkSettingsAndToggleFuzzyDate()

browser.runtime.onMessage.addListener(async message => {
    if (message === 'settings-updated') {
        checkSettingsAndToggleFuzzyDate()
    }
})

const getCursor = (node: RoamNode, newText: string, searchStart: number = 0) =>
    node.text === newText ? node.selection.start : afterClosingBrackets(newText, searchStart)

export function replaceFuzzyDate(guard: string) {
    const dateContainerExpr = new RegExp(`${guard}\(\.\{3,\}\?\)${guard}`, 'gm')

    Roam.applyToCurrent(node => {
        const match = node.text.match(dateContainerExpr)
        if (!match) return node

        const dateStr = match[0]
        const date = chrono.parseDate(dateStr, new Date(), {
            forwardDate: true,
        })
        if (!date) return node

        let replaceMode = dateStr.startsWith(';:')

        let replaceWith = replaceMode ? '' : RoamDate.formatPage(date)
        const newText = node.text.replace(dateContainerExpr, replaceWith)

        const cursor = getCursor(node, newText, replaceMode ? 0 : node.selection.start)
        const newNode = new NodeWithDate(newText, new Selection(cursor, cursor))

        return replaceMode ? newNode.withDate(date) : newNode
    })
}

/**
 * We use `keypress`, since `keyup` is sometimes firing for individual keys instead of the pressed key
 * when the guard character is requiring a multi-key stroke.
 *
 * `setTimeout` is used to put the callback to the end of the event queue,
 * since the input is not yet changed when keypress is firing.
 */
const registerEventListener = () => {
    document.addEventListener('keypress', keypressListener)
}

const removeEventListener = () => {
    document.removeEventListener('keypress', keypressListener)
}

const keypressListener = (ev: KeyboardEvent) => {
    Settings.get(config.id, 'guard').then((value: string) => {
        if (ev.key === value) {
            setTimeout(() => replaceFuzzyDate(value), 0)
        }
    })
}
