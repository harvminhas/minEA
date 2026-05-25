from pydantic import BaseModel, Field


class CapabilityTemplateSummary(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    domain_count: int
    capability_count: int


class CapabilityTemplateDomain(BaseModel):
    name: str
    icon: str
    capabilities: list[str]


class CapabilityTemplateDetail(CapabilityTemplateSummary):
    domains: list[CapabilityTemplateDomain]


class CapabilityMapStatus(BaseModel):
    initialized: bool
    domain_count: int
    capability_count: int


class CapabilityMapDomain(BaseModel):
    id: str
    name: str
    icon: str | None = None
    order_index: int | None = None
    source_template_id: str | None = None
    capabilities: list["CapabilityMapCapability"] = Field(default_factory=list)


class CapabilityMapCapability(BaseModel):
    id: str
    name: str
    domain_id: str
    order_index: int | None = None
    maturity: int | None = None
    investment: str | None = None


class CapabilityMapRead(BaseModel):
    initialized: bool
    domains: list[CapabilityMapDomain]


class AdoptTemplateRequest(BaseModel):
    template_id: str


class AdoptTemplateResponse(BaseModel):
    template_id: str
    domain_count: int
    capability_count: int


class LibraryDomainSuggestion(BaseModel):
    name: str
    icon: str
    template_id: str
    already_on_map: bool = False


class LibraryDomainGroup(BaseModel):
    template_id: str
    template_name: str
    template_icon: str
    domains: list[LibraryDomainSuggestion]


class LibraryCapabilityItem(BaseModel):
    name: str
    already_in_domain: bool = False


class LibraryCapabilityTemplateGroup(BaseModel):
    template_id: str
    template_name: str
    template_icon: str
    capabilities: list[LibraryCapabilityItem]


class ReusableCapabilitySuggestion(BaseModel):
    name: str
    from_domain: str


class CapabilityPickerSuggestions(BaseModel):
    reusable: list[ReusableCapabilitySuggestion]
    template_groups: list[LibraryCapabilityTemplateGroup]


class DomainMappingSystem(BaseModel):
    id: str
    name: str
    category: str | None = None
    vendor: str | None = None
    status: str | None = None
    hosting_model: str | None = None


class DomainCapabilityMapping(BaseModel):
    capability_id: str
    system_id: str
    relationship_id: str
    fitness: str


class DomainMappingStats(BaseModel):
    capability_count: int
    mapped_system_count: int
    strong_count: int
    adequate_count: int
    weak_count: int
    gap_count: int


class DomainDetailRead(BaseModel):
    id: str
    name: str
    icon: str | None = None
    owner: str | None = None
    description: str | None = None
    source_template_id: str | None = None
    capabilities: list[CapabilityMapCapability]
    systems: list[DomainMappingSystem]
    mappings: list[DomainCapabilityMapping]
    stats: DomainMappingStats


class UpsertDomainMappingRequest(BaseModel):
    capability_id: str
    system_id: str
    fitness: str


class AddDomainMappingSystemRequest(BaseModel):
    system_id: str


class CreateDomainMappingSystemRequest(BaseModel):
    name: str
    category: str | None = None
    vendor: str | None = None
    hosting_model: str | None = None
