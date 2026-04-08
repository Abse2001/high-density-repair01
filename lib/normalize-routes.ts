import type {
  NodeHdRoute,
  NodeWithPortPoints,
  Point2D,
  Point3D,
  PortPoint,
} from "./types"

const POSITION_EPSILON = 1e-6

const getDistance = (left: Point2D, right: Point2D) =>
  Math.hypot(left.x - right.x, left.y - right.y)

const arePointsCoincident = (left: Point2D, right: Point2D) =>
  getDistance(left, right) <= POSITION_EPSILON

const copyPoint = (point: Point3D): Point3D => ({
  x: point.x,
  y: point.y,
  z: point.z,
  ...(point.insideJumperPad === undefined
    ? {}
    : { insideJumperPad: point.insideJumperPad }),
})

const copyPortPoint = (portPoint: PortPoint): Point3D => ({
  x: portPoint.x,
  y: portPoint.y,
  z: portPoint.z,
  ...(portPoint.insideJumperPad === undefined
    ? {}
    : { insideJumperPad: portPoint.insideJumperPad }),
})

const cloneRoute = (route: NodeHdRoute): NodeHdRoute => ({
  ...route,
  route: route.route.map(copyPoint),
  vias: route.vias.map((via) => ({ ...via })),
  viaRegions: route.viaRegions?.map((viaRegion) => ({
    ...viaRegion,
    center: { ...viaRegion.center },
    connectedTo: [...viaRegion.connectedTo],
  })),
})

const getFirstMovedPointIndex = (points: Point3D[]) => {
  const startPoint = points[0]
  if (!startPoint) return null

  for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
    const point = points[pointIndex]
    if (!point) continue

    if (!arePointsCoincident(startPoint, point)) {
      return pointIndex
    }
  }

  return null
}

const getLastMovedPointIndex = (points: Point3D[]) => {
  const endPoint = points.at(-1)
  if (!endPoint) return null

  for (let pointIndex = points.length - 2; pointIndex >= 0; pointIndex -= 1) {
    const point = points[pointIndex]
    if (!point) continue

    if (!arePointsCoincident(endPoint, point)) {
      return pointIndex
    }
  }

  return null
}

const deriveVias = (points: Point3D[]) => {
  const vias: Point2D[] = []

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    if (!current || !next) continue

    if (current.z === next.z) continue
    if (!arePointsCoincident(current, next)) continue

    const lastVia = vias.at(-1)
    if (lastVia && arePointsCoincident(lastVia, current)) {
      continue
    }

    vias.push({
      x: current.x,
      y: current.y,
    })
  }

  return vias
}

const getRoutePortsByConnection = (nodeWithPortPoints: NodeWithPortPoints) => {
  const routePortsByConnection = new Map<string, PortPoint[]>()

  for (const portPoint of nodeWithPortPoints.portPoints) {
    const existingPortPoints =
      routePortsByConnection.get(portPoint.connectionName) ?? []
    existingPortPoints.push(portPoint)
    routePortsByConnection.set(portPoint.connectionName, existingPortPoints)
  }

  return routePortsByConnection
}

const getEndpointPorts = (
  route: NodeHdRoute,
  portPointsByConnection: Map<string, PortPoint[]>,
) => {
  const routePorts = portPointsByConnection.get(route.connectionName)
  if (!routePorts || routePorts.length !== 2) {
    return null
  }

  const startPoint = route.route[0]
  const endPoint = route.route.at(-1)
  const firstPort = routePorts[0]
  const secondPort = routePorts[1]

  if (!startPoint || !endPoint || !firstPort || !secondPort) {
    return null
  }

  const directDistance =
    getDistance(startPoint, firstPort) + getDistance(endPoint, secondPort)
  const swappedDistance =
    getDistance(startPoint, secondPort) + getDistance(endPoint, firstPort)

  return directDistance <= swappedDistance
    ? { startPort: firstPort, endPort: secondPort }
    : { startPort: secondPort, endPort: firstPort }
}

const ensureStartAttachmentLayer = (points: Point3D[], startPort: PortPoint) => {
  if (points.length === 0) {
    return
  }

  points[0] = copyPortPoint(startPort)
  const firstMovedPointIndex = getFirstMovedPointIndex(points)
  if (firstMovedPointIndex === null) {
    return
  }

  for (let pointIndex = 0; pointIndex < firstMovedPointIndex; pointIndex += 1) {
    const point = points[pointIndex]
    if (!point) continue

    point.x = startPort.x
    point.y = startPort.y
    point.z = startPort.z
  }

  const movedPoint = points[firstMovedPointIndex]
  if (!movedPoint || movedPoint.z === startPort.z) {
    return
  }

  points.splice(firstMovedPointIndex, 0, {
    ...copyPoint(movedPoint),
    z: startPort.z,
  })
}

const ensureEndAttachmentLayer = (points: Point3D[], endPort: PortPoint) => {
  if (points.length === 0) {
    return
  }

  const lastPointIndex = points.length - 1
  points[lastPointIndex] = copyPortPoint(endPort)
  const lastMovedPointIndex = getLastMovedPointIndex(points)
  if (lastMovedPointIndex === null) {
    return
  }

  for (
    let pointIndex = lastMovedPointIndex + 1;
    pointIndex < points.length;
    pointIndex += 1
  ) {
    const point = points[pointIndex]
    if (!point) continue

    point.x = endPort.x
    point.y = endPort.y
    point.z = endPort.z
  }

  const movedPoint = points[lastMovedPointIndex]
  if (!movedPoint || movedPoint.z === endPort.z) {
    return
  }

  points.splice(lastMovedPointIndex + 1, 0, {
    ...copyPoint(movedPoint),
    z: endPort.z,
  })
}

const normalizeRouteEndpointLayers = (
  route: NodeHdRoute,
  startPort: PortPoint,
  endPort: PortPoint,
) => {
  const normalizedRoute = cloneRoute(route)

  if (normalizedRoute.route.length < 2) {
    if (!arePointsCoincident(startPort, endPort)) {
      normalizedRoute.route = [copyPortPoint(startPort), copyPortPoint(endPort)]
    } else {
      normalizedRoute.route = [copyPortPoint(startPort)]
    }
    normalizedRoute.vias = deriveVias(normalizedRoute.route)
    return normalizedRoute
  }

  ensureStartAttachmentLayer(normalizedRoute.route, startPort)
  ensureEndAttachmentLayer(normalizedRoute.route, endPort)
  normalizedRoute.vias = deriveVias(normalizedRoute.route)

  return normalizedRoute
}

export const normalizeRoutesToPortAttachments = (
  nodeWithPortPoints: NodeWithPortPoints,
  routes: NodeHdRoute[],
) => {
  const portPointsByConnection = getRoutePortsByConnection(nodeWithPortPoints)

  return routes.map((route) => {
    const endpointPorts = getEndpointPorts(route, portPointsByConnection)
    if (!endpointPorts) {
      return cloneRoute(route)
    }

    return normalizeRouteEndpointLayers(
      route,
      endpointPorts.startPort,
      endpointPorts.endPort,
    )
  })
}
