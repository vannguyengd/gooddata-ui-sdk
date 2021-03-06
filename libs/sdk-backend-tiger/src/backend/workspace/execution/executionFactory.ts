// (C) 2019-2020 GoodData Corporation

import { IPreparedExecution, NotImplemented } from "@gooddata/sdk-backend-spi";
import { IExecutionDefinition, IFilter } from "@gooddata/sdk-model";
import { TigerPreparedExecution } from "./preparedExecution";
import { AuthenticatedCallGuard, AbstractExecutionFactory } from "@gooddata/sdk-backend-base";
import { DateFormatter } from "../../../convertors/fromBackend/dateFormatting/types";

export class TigerExecution extends AbstractExecutionFactory {
    constructor(
        private readonly authCall: AuthenticatedCallGuard,
        workspace: string,
        private readonly dateFormatter: DateFormatter,
    ) {
        super(workspace);
    }

    public forDefinition(def: IExecutionDefinition): IPreparedExecution {
        return new TigerPreparedExecution(this.authCall, def, this, this.dateFormatter);
    }

    public forInsightByRef(_uri: string, _filters?: IFilter[]): Promise<IPreparedExecution> {
        throw new NotImplemented("execution by uri reference not yet implemented");
    }
}
