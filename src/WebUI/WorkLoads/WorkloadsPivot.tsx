/*
    Copyright (c) Microsoft Corporation. All rights reserved.
    Licensed under the MIT license.
*/

import { V1DeploymentList, V1ReplicaSet, V1ReplicaSetList, V1ServiceList, V1DaemonSetList, V1StatefulSetList, V1Service, V1PodList, V1Pod, V1DaemonSet, V1StatefulSet, V1PodTemplateSpec, V1ObjectMeta } from "@kubernetes/client-node";
import { BaseComponent, format } from "@uifabric/utilities";
import * as React from "react";
import { IKubeService } from "../../Contracts/Contracts";
import * as Resources from "../Resources";
import { IVssComponentProperties, IServiceItem, IDeploymentReplicaSetItem } from "../Types";
import { Utils } from "../Utils";
import { DeploymentsTable } from "../Workloads/DeploymentsTable";
import "../Common/KubeSummary.scss";
// todo :: work around till this issue is fixed in devops ui
import "azure-devops-ui/Label.scss";
import { DaemonSetTable } from "../Workloads/DaemonSetTable";
import { StatefulSetTable } from "../Workloads/StatefulSetTable";
import { PodsTable } from "../Pods/PodsTable";
import { KubeZeroData } from "../Common//KubeZeroData";
import { Filter, IFilterState, FILTER_CHANGE_EVENT, IFilterItemState } from "azure-devops-ui/Utilities/Filter";
import { KubeResourceType } from "../../Contracts/KubeServiceBase";
import { WorkloadsFilterBar } from "./WorkloadsFilterBar";
import { ObservableValue } from "azure-devops-ui/Core/Observable";
import { SelectedItemKeys } from "../Constants";
import { WorkloadsActionsCreator } from "./WorkloadsActionsCreator";
import { PodsActionsCreator } from "../Pods/PodsActionsCreator";
import { WorkloadsStore } from "./WorkloadsStore";
import { ActionsCreatorManager } from "../FluxCommon/ActionsCreatorManager";
import { StoreManager } from "../FluxCommon/StoreManager";
import { WorkloadsEvents } from "../Constants";
import { PodsStore } from "../Pods/PodsStore";
import { NameKey, TypeKey } from "../Common/KubeFilterBar";

export interface IWorkloadsPivotState {
    workloadResourceSize: number;
    orphanPodsList: V1Pod[];
}

export interface IWorkloadsPivotProps extends IVssComponentProperties {
    kubeService: IKubeService;
    filter: Filter;
    namespace?: string;
    filterToggled: ObservableValue<boolean>;
}

export class WorkloadsPivot extends BaseComponent<IWorkloadsPivotProps, IWorkloadsPivotState> {
    constructor(props: IWorkloadsPivotProps) {
        super(props, {});

        this._podsActionCreator = ActionsCreatorManager.GetActionCreator<PodsActionsCreator>(PodsActionsCreator);
        this._workloadsStore = StoreManager.GetStore<WorkloadsStore>(WorkloadsStore);
        // Initialize pods store as pods list will be required in workloadPodsView on item selection
        StoreManager.GetStore<PodsStore>(PodsStore);

        this.state = {
            orphanPodsList: [],
            workloadResourceSize: 0
        };

        // Fetch all pods in parent component as the podList is required in orphan set table as well as selected workload pods view
        this._podsActionCreator.getPods(this.props.kubeService);

        this._workloadsStore.addListener(WorkloadsEvents.WorkloadPodsFetchedEvent, this._onPodsFetched);
        this._workloadsStore.addListener(WorkloadsEvents.WorkloadsFoundEvent, this._onDataFound);
    }

    public render(): React.ReactNode {
        return (
            <div className="item-padding">
                {this._getFilterBar()}
                {this._getContent()}
            </div>
        );
    }

    public componentWillUnmount(): void {
        this._workloadsStore.removeListener(WorkloadsEvents.WorkloadPodsFetchedEvent, this._onPodsFetched);
        this._workloadsStore.removeListener(WorkloadsEvents.WorkloadsFoundEvent, this._onDataFound);
    }

    private _onPodsFetched = (): void => {
        const storeState = this._workloadsStore.getState();
        this.setState({ orphanPodsList: storeState.orphanPodsList || [] });
    }

    private _onDataFound = (): void => {
        const workloadSize = this._workloadsStore.getWorkloadSize();
        if (this.state.workloadResourceSize <= 0 && workloadSize > 0) {
            this.setState({ workloadResourceSize: workloadSize });
        }
    }

    private _getContent(): JSX.Element {
        return (this.state.workloadResourceSize === 0 ?
            KubeZeroData._getDefaultZeroData("https://kubernetes.io/docs/concepts/workloads/pods/pod/", Resources.LearnMoreText,
                Resources.NoWorkLoadsText, Resources.NoWorkLoadsText)
            :
            <div>
                {this._showComponent(KubeResourceType.Deployments) && this._getDeployments()}
                {this._showComponent(KubeResourceType.DaemonSets) && this._getDaemonSetsComponent()}
                {this._showComponent(KubeResourceType.StatefulSets) && this._getStatefulSetsComponent()}
                {this.state.orphanPodsList && this.state.orphanPodsList.length > 0 &&
                    this._showComponent(KubeResourceType.Pods) && this.getOrphanPods()}
            </div>);
    }

    private _getFilterBar(): JSX.Element {
        return (<WorkloadsFilterBar filter={this.props.filter}
            filterToggled={this.props.filterToggled}
        />);
    }

    private getOrphanPods(): JSX.Element {
        let pods: V1Pod[] | undefined = this._workloadsStore.getState().orphanPodsList || [];
        // Since PodsTable is a common component between services and workloads, we are sending pods to render as a prop
        return <PodsTable
            key={format("orphan-pods-list-{0}", this.props.namespace || "")}
            podsToRender={pods}
            nameFilter={this._getNameFilterValue()}
        />;
    }

    private _getDaemonSetsComponent(): JSX.Element {
        return (<DaemonSetTable
            key={format("ds-list-{0}", this.props.namespace || "")}
            kubeService={this.props.kubeService}
            nameFilter={this._getNameFilterValue()}
        />);
    }

    private _getStatefulSetsComponent(): JSX.Element {
        return (<StatefulSetTable
            key={format("sts-list-{0}", this.props.namespace || "")}
            kubeService={this.props.kubeService}
            nameFilter={this._getNameFilterValue()}
        />);
    }

    private _getDeployments(): JSX.Element {
        return (<DeploymentsTable
            key={format("dc-{0}", this.props.namespace || "")}
            kubeService={this.props.kubeService}
            nameFilter={this._getNameFilterValue()}
        />);
    }

    private _getNameFilterValue(): string | undefined {
        const filterState: IFilterState | undefined = this.props.filter.getState();
        const filterItem: IFilterItemState | null = filterState ? filterState[NameKey] : null;
        return filterItem ? (filterItem.value as string) : undefined;
    }

    private _getTypeFilterValue(): any[] {
        const filterState: IFilterState | undefined = this.props.filter.getState();
        const filterItem: IFilterItemState | null = filterState ? filterState[TypeKey] : null;
        const selections: any[] = filterItem ? filterItem.value : [];
        return selections;
    }

    private _showComponent(resourceType: KubeResourceType): boolean {
        const selections: KubeResourceType[] = this._getTypeFilterValue();
        // if no selections are made, show all components
        if (selections.length > 0) {
            return selections.indexOf(resourceType) != -1;
        }

        return true;
    }

    private _workloadsStore: WorkloadsStore;
    private _podsActionCreator: PodsActionsCreator;
}