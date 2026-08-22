import { Redirect, Route, Switch } from 'wouter'
import { ClassicPage } from '../pages/ClassicPage'
import { StandardPage } from '../pages/StandardPage'
import { PlusPage } from '../pages/PlusPage'

export function AppRouter() {
  return (
    <Switch>
      <Route path="/engine2048" component={ClassicPage} />
      <Route path="/engine2048/standard" component={StandardPage} />
      <Route path="/engine2048/plus" component={PlusPage} />
      <Route>
        <Redirect to="/engine2048" />
      </Route>
    </Switch>
  )
}
